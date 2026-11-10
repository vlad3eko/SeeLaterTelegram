
import { GoogleGenAI } from '@google/genai';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { WhisperTranscript } from '../types.js';
import {
    assertFileExists,
    runProcess,
} from '../utils/process.js';
import { isBudgetExceeded, withinBudget } from '../utils/budget.js';
import { isRateLimitError } from '../utils/rate-limit.js';

const GEMINI_TRANSCRIBE_MODEL = 'gemini-3.5-transcribe';

const FILE_PROCESSING_TIMEOUT_MS = 90_000;
const FILE_POLL_INTERVAL_MS = 1_000;
const INTERACTION_TIMEOUT_MS = 180_000;
const MAX_ANNOTATED_WORDS = 20_000;

export type GeminiTranscriptionOptions = {
    inputPath: string;
    ffmpegPath?: string;
    language?: string;
    timeoutMs?: number;
    /**
     * Transcribe only this part of the track (coverage pass for speech the
     * first request skipped). The language is detected automatically and the
     * returned timestamps are shifted back to the whole clip's timeline.
     */
    clip?: { startSeconds: number; durationSeconds: number };
};

type GeminiWordAnnotation = {
    type?: string;
    text?: string;
    start_offset?: string;
    end_offset?: string;
    speaker?: string;
    language_code?: string;
    language?: string;
};

type GeminiInteractionResponse = {
    id?: string;
    status?: string;
    output_text?: string;
    steps?: Array<{
        content?: Array<{
            annotations?: GeminiWordAnnotation[];
        }>;
    }>;
};

const sleep = (ms: number): Promise<void> =>
    new Promise(resolve => setTimeout(resolve, ms));

function normalizeLanguageCode(language: string): string {
    const normalized = language.trim().toLowerCase();

    const knownLanguages: Record<string, string> = {
        ru: 'ru-RU',
        en: 'en-US',
        fr: 'fr-FR',
        de: 'de-DE',
        es: 'es-ES',
    };

    return knownLanguages[normalized] ?? language;
}

function parseTimeOffset(value: string): number {
    const match = value.trim().match(/^(-?\d+(?:\.\d+)?)(ms|s)?$/i);

    if (!match) {
        throw new Error(
            `[GEMINI TRANSCRIBE] Invalid word timestamp: ${value}`,
        );
    }

    const numericValue = Number(match[1]);
    const unit = match[2]?.toLowerCase();

    const seconds = unit === 'ms'
        ? numericValue / 1_000
        : numericValue;

    if (!Number.isFinite(seconds) || seconds < 0) {
        throw new Error(
            `[GEMINI TRANSCRIBE] Invalid timestamp value: ${value}`,
        );
    }

    return seconds;
}

function extractWordAnnotations(
    interaction: GeminiInteractionResponse,
): WhisperTranscript {
    const words: WhisperTranscript['words'] = [];
    let skippedAnnotations = 0;

    for (const step of interaction.steps ?? []) {
        for (const content of step.content ?? []) {
            for (const annotation of content.annotations ?? []) {
                if (annotation.type !== 'word_info') {
                    continue;
                }

                const text = annotation.text?.trim();
                const startOffset = annotation.start_offset;
                const endOffset = annotation.end_offset;

                if (!text || !startOffset || !endOffset) {
                    continue;
                }

                // One malformed timestamp must not discard the whole transcript.
                let start: number;
                let end: number;

                try {
                    start = parseTimeOffset(startOffset);
                    end = parseTimeOffset(endOffset);
                } catch {
                    skippedAnnotations += 1;
                    continue;
                }

                if (end <= start || words.length >= MAX_ANNOTATED_WORDS) {
                    continue;
                }

                words.push({
                    text,
                    start,
                    end,
                    // Only a language the transcriber really reported.
                    ...((annotation.language_code ?? annotation.language)
                        ? { language: annotation.language_code ?? annotation.language }
                        : {}),
                    ...(annotation.speaker
                        ? { speaker: annotation.speaker }
                        : {}),
                });
            }
        }
    }

    words.sort((a, b) => a.start - b.start);

    if (skippedAnnotations > 0) {
        console.warn('[GEMINI TRANSCRIBE] Skipped words with invalid timestamps', { skippedAnnotations });
    }

    if (words.length === 0) {
        throw new Error(
            '[GEMINI TRANSCRIBE] No valid word_info annotations returned. ' +
            `Model output: ${interaction.output_text?.slice(0, 1_000) ?? '(empty)'}`,
        );
    }

    return {
        words,
        // Gemini Transcribe is used here for spoken words.
        // Sound-event detection remains a separate task.
        soundCues: [],
    };
}

export async function transcribeInstagramTranscriptWithGemini(
    options: GeminiTranscriptionOptions,
): Promise<WhisperTranscript> {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        throw new Error('[GEMINI TRANSCRIBE] GEMINI_API_KEY is missing');
    }

    await assertFileExists(options.inputPath, 'Input video');

    const ffmpegPath =
        options.ffmpegPath ??
        process.env.FFMPEG_PATH ??
        process.env.WHISPER_FFMPEG_PATH ??
        'ffmpeg';

    const language = options.language ?? 'ru';
    const languageCode = normalizeLanguageCode(language);

    const tempDirectory = await mkdtemp(
        path.join(os.tmpdir(), 'kinomanov-gemini-transcription-'),
    );

    const audioPath = path.join(tempDirectory, 'audio.wav');

    const ai = new GoogleGenAI({ apiKey });

    let uploadedFileName: string | undefined;
    let interactionId: string | undefined;
    let interactionIsTerminal = false;

    try {
        // 1. Extract the complete audio track.
        // The source video is not modified.
        console.info('[GEMINI TRANSCRIBE] Extracting audio', {
            inputPath: options.inputPath,
            language,
        });

        await runProcess(
            ffmpegPath,
            [
                '-hide_banner',
                '-nostdin',
                '-y',
                ...(options.clip
                    ? [
                        '-ss', options.clip.startSeconds.toFixed(3),
                        '-t', options.clip.durationSeconds.toFixed(3),
                    ]
                    : []),
                '-i',
                options.inputPath,
                '-map',
                '0:a:0',
                '-vn',
                '-ac',
                '1',
                '-ar',
                '16000',
                '-c:a',
                'pcm_s16le',
                '-f',
                'wav',
                audioPath,
            ],
            {
                label: 'Extract audio for Gemini transcription',
                timeoutMs: options.timeoutMs ?? 5 * 60 * 1000,
            },
        );

        await assertFileExists(audioPath, 'Extracted audio');

        // 2. Upload audio to Gemini Files API.
        console.info('[GEMINI TRANSCRIBE] Uploading audio');

        const uploadedFile = await withinBudget('Gemini audio upload', () => ai.files.upload({
            file: audioPath,
            config: {
                mimeType: 'audio/wav',
            },
        }));

        if (!uploadedFile.name) {
            throw new Error(
                '[GEMINI TRANSCRIBE] Upload returned no file name',
            );
        }

        uploadedFileName = uploadedFile.name;

        // 3. Wait for file processing.
        const processingDeadline =
            Date.now() + FILE_PROCESSING_TIMEOUT_MS;

        let readyFile = await withinBudget('Gemini file status', () => ai.files.get({
            name: uploadedFile.name!,
        }));

        while (readyFile.state !== 'ACTIVE') {
            if (readyFile.state === 'FAILED') {
                throw new Error(
                    '[GEMINI TRANSCRIBE] Audio file processing failed',
                );
            }

            if (Date.now() >= processingDeadline) {
                throw new Error(
                    '[GEMINI TRANSCRIBE] Audio file processing timeout',
                );
            }

            await sleep(FILE_POLL_INTERVAL_MS);

            readyFile = await withinBudget('Gemini file status', () => ai.files.get({
                name: uploadedFile.name!,
            }));
        }

        if (!readyFile.uri) {
            throw new Error(
                '[GEMINI TRANSCRIBE] Processed audio has no URI',
            );
        }

        console.info('[GEMINI TRANSCRIBE] Audio is ACTIVE');

        // 4. Request verbatim word-level transcription.
        // Speaker labels (diarization_mode) are requested first; some API
        // versions reject the field, then the request is repeated without it
        // and speakers come from the voice analysis only.
        const createInteraction = (diarize: boolean, autoLanguage: boolean) => ai.interactions.create(
            {
                model: GEMINI_TRANSCRIBE_MODEL,

                input: [
                    {
                        type: 'audio',
                        uri: readyFile.uri!,
                        mime_type: readyFile.mimeType || 'audio/wav',
                    },
                ],

                generation_config: {
                    transcription_config: {
                        // Automatic language detection lets foreign lines (English,
                        // Italian, ...) be transcribed in their own language.
                        ...(autoLanguage ? {} : { language_codes: [languageCode] }),

                        mode: {
                            type: 'verbatim',
                            ...(diarize ? { diarization_mode: 'speaker' } : {}),
                            timestamp_granularities: ['word'],
                        },
                    },
                },
            } as never,
            {
                timeout_ms: INTERACTION_TIMEOUT_MS,

                retries: {
                    strategy: 'backoff',

                    backoff: {
                        initialInterval: 1_000,
                        maxInterval: 5_000,
                        exponent: 2,
                        maxElapsedTime: 30_000,
                    },

                    retryConnectionErrors: true,
                },

                retry_codes: ['503'],
            },
        );

        const switchedOff = (name: string): boolean =>
            ['off', '0', 'false', 'no'].includes(
                (process.env[name] ?? 'on').trim().toLowerCase(),
            );
        const attempts: Array<{ diarize: boolean; autoLanguage: boolean }> = [];

        if (options.clip) {
            // Coverage pass: the language is always detected automatically.
            if (!switchedOff('REEL_SUBTITLE_SPEAKERS')) {
                attempts.push({ diarize: true, autoLanguage: true });
            }
            attempts.push({ diarize: false, autoLanguage: true });
        } else {
            if (!switchedOff('REEL_SUBTITLE_SPEAKERS') && !switchedOff('REEL_SUBTITLE_AUTO_LANGUAGE')) {
                attempts.push({ diarize: true, autoLanguage: true });
            }
            if (!switchedOff('REEL_SUBTITLE_AUTO_LANGUAGE')) {
                attempts.push({ diarize: false, autoLanguage: true });
            }
            if (!switchedOff('REEL_SUBTITLE_SPEAKERS')) {
                attempts.push({ diarize: true, autoLanguage: false });
            }
            attempts.push({ diarize: false, autoLanguage: false });
        }

        let interactionResult: unknown;
        let lastError: unknown;
        let usedAttempt: { diarize: boolean; autoLanguage: boolean } | undefined;

        for (const attempt of attempts) {
            try {
                interactionResult = await withinBudget(
                    'Gemini transcription request',
                    () => createInteraction(attempt.diarize, attempt.autoLanguage),
                );
                lastError = undefined;
                usedAttempt = attempt;
                break;
            } catch (error) {
                // The time budget is used up: simpler variants would not get time either.
                if (isBudgetExceeded(error)) throw error;

                lastError = error;
                console.warn('[GEMINI TRANSCRIBE] Request failed; trying a simpler one.', {
                    ...attempt,
                    message: error instanceof Error ? error.message : String(error),
                });

                // A coverage clip has no other variant worth trying once the
                // quota is used up: every further request would fail as well.
                if (options.clip && isRateLimitError(error)) break;
            }
        }

        if (lastError !== undefined) throw lastError;

        const interaction =
            interactionResult as unknown as GeminiInteractionResponse;

        interactionId = interaction.id;
        interactionIsTerminal = true;

        if (interaction.status !== 'completed') {
            throw new Error(
                `[GEMINI TRANSCRIBE] Interaction failed: ${interaction.status}`,
            );
        }

        // 5. Convert native Gemini annotations to existing WordTiming.
        const transcript = extractWordAnnotations(interaction);

        if (options.clip) {
            const { startSeconds } = options.clip;

            const clipLength = options.clip.durationSeconds + 0.5;

            transcript.words = transcript.words
                .filter(word => word.start < clipLength)
                .map(word => ({
                ...word,
                start: word.start + startSeconds,
                end: Math.min(word.end, clipLength) + startSeconds,
                // Labels of a separate request are not comparable with the
                // first one: the voice analysis decides who is who.
                ...(word.speaker ? { speaker: `clip@${startSeconds.toFixed(1)}:${word.speaker}` } : {}),
            }));
        }

        console.info('[GEMINI TRANSCRIBE COMPLETED]', {
            model: GEMINI_TRANSCRIBE_MODEL,
            language: options.clip ? 'auto' : language,
            request: usedAttempt
                ? `${usedAttempt.autoLanguage ? 'auto-language' : `language=${language}`}, ` +
                  `${usedAttempt.diarize ? 'speakers' : 'no speakers'}`
                : undefined,
            ...(options.clip ? { clip: options.clip } : {}),
            wordCount: transcript.words.length,
            soundCueCount: transcript.soundCues.length,
            durationSeconds: transcript.words.at(-1)?.end ?? 0,
        });

        return transcript;
    } catch (error) {
        console.error('[GEMINI TRANSCRIBE FAILED]', {
            message: error instanceof Error
                ? error.message
                : String(error),
            stack: error instanceof Error
                ? error.stack
                : undefined,
        });

        throw error;
    } finally {
        // 6. Delete the completed Interaction.
        if (interactionId && interactionIsTerminal) {
            try {
                await ai.interactions.delete(interactionId);

                console.info(
                    '[GEMINI TRANSCRIBE] Interaction deleted',
                    interactionId,
                );
            } catch (error) {
                console.error(
                    '[GEMINI TRANSCRIBE] Interaction deletion failed',
                    error,
                );
            }
        }

        // 7. Delete uploaded audio from Gemini.
        if (uploadedFileName) {
            try {
                await ai.files.delete({
                    name: uploadedFileName,
                });

                console.info(
                    '[GEMINI TRANSCRIBE] Uploaded audio deleted',
                    uploadedFileName,
                );
            } catch (error) {
                console.error(
                    '[GEMINI TRANSCRIBE] File deletion failed',
                    error,
                );
            }
        }

        // 8. Remove local temporary WAV.
        await rm(tempDirectory, {
            recursive: true,
            force: true,
        }).catch(error => {
            console.error(
                '[GEMINI TRANSCRIBE] Local cleanup failed',
                error,
            );
        });
    }
}
