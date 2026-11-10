import {readFile, writeFile} from 'node:fs/promises';
import type { WhisperOptions, WhisperTranscript, WordTiming } from '../types.js';
import {
    assertFileExists,
    prepareOutputPath,
    runProcess,
    ffmpegFilterGraphPath
} from '../utils/process.js';
import { parseWhisperTranscriptNdjson } from './parse-whisper-json.js';
import {
    transcribeInstagramTranscriptWithGemini
} from './gemini.js';
import { retimeWordsByReference } from './retime-words.js';
import { readVoiceEnvelope, snapWordsToVoice, type SpeechRange } from './voice-snap.js';
import { analyseSpeakers } from './speaker-analysis.js';
import { translateForeignSpeech } from './translate-foreign.js';
import { fillUncoveredSpeech, transcribeRanges } from './coverage-pass.js';
import { maxVerifyClips, planClips, verifyMode, verifyTranscript } from './verify-transcript.js';
import { assertLanguageCode } from '../utils/safe-input.js';

export async function transcribeWithWhisper(options: WhisperOptions): Promise<WhisperTranscript> {
  const ffmpegPath = options.ffmpegPath ?? process.env.WHISPER_FFMPEG_PATH ?? 'ffmpeg';
  // The code is placed into an FFmpeg filter graph: only a plain code may pass.
  const language = assertLanguageCode(options.language ?? 'ru');
  const queueSeconds = options.queueSeconds ?? 10;
  const maxLen = options.maxLen ?? 1;
  const useGpu = options.useGpu ?? false;

  await assertFileExists(options.inputPath, 'Input video');
  await assertFileExists(options.modelPath, 'Whisper model');
  if (!Number.isInteger(maxLen) || maxLen < 1) {
    throw new Error('Whisper maxLen must be an integer >= 1 to request word-level segments.');
  }
  if (!Number.isFinite(queueSeconds) || queueSeconds < 1) {
    throw new Error('Whisper queueSeconds must be >= 1.');
  }

    const capabilities = await runProcess(
        ffmpegPath,
        ['-hide_banner', '-filters'],
        {
            label: 'Check FFmpeg Whisper filter',
            timeoutMs: 15_000,
        },
    );

    const filterOutput = [
        capabilities.stdout,
        capabilities.stderr,
    ].join('\n');

    const hasWhisperFilter = filterOutput
        .split(/\r?\n/)
        .some((line) =>
            /^\s*\S+\s+whisper\s+A->A(?:\s|$)/i.test(line),
        );

    if (!hasWhisperFilter) {
        const whisperDiagnostics = filterOutput
            .split(/\r?\n/)
            .filter((line) => /whisper/i.test(line))
            .slice(0, 5)
            .join('\n');

        throw new Error(
            `[SUBTITLE] FFmpeg binary does not expose the whisper filter: ${ffmpegPath}.\n` +
            'Expected a registered audio filter named "whisper".\n' +
            `FFmpeg diagnostic output:\n${whisperDiagnostics || '(No Whisper-related output captured)'}`,
        );
    }

  await prepareOutputPath(options.outputPath);
  const filter = [
    `whisper=model=${ffmpegFilterGraphPath(options.modelPath)}`,
    `language=${language}`,
    `queue=${queueSeconds}s`,
    `use_gpu=${useGpu ? 1 : 0}`,
    `max_len=${maxLen}`,
    `destination=${ffmpegFilterGraphPath(options.outputPath)}`,
    'format=json',
  ].join(':');

  console.info('[SUBTITLE] Starting local Whisper transcription', {
    inputPath: options.inputPath,
    language,
    queueSeconds,
    maxLen,
    useGpu,
  });

  await runProcess(ffmpegPath, [
    '-hide_banner', '-nostdin', '-y',
    '-i', options.inputPath,
    '-vn',
    '-af', filter,
    '-f', 'null', '-',
  ], {
    label: 'FFmpeg Whisper transcription',
    timeoutMs: options.timeoutMs ?? 30 * 60 * 1000,
  });

  const ndjson = await readFile(options.outputPath, 'utf8');
  const transcript = parseWhisperTranscriptNdjson(ndjson);
  console.info('[SUBTITLE] Whisper transcription completed', {
    wordCount: transcript.words.length,
    soundCueCount: transcript.soundCues.length,
  });
  return transcript;
}


export async function transcribeInstagramTranscript(
    options: WhisperOptions,
): Promise<WhisperTranscript> {
    const provider = (
        process.env.REEL_SUBTITLE_TRANSCRIPTION_PROVIDER ?? 'whisper'
    ).trim().toLowerCase();

    if (provider === 'whisper') {
        return annotateSpeakers(
            await snapTranscriptToVoice(await transcribeWithWhisper(options), options),
            options,
        );
    }

    if (provider !== 'gemini') {
        throw new Error(
            `[SUBTITLE] Unknown transcription provider: ${provider}`,
        );
    }

    console.info('[SUBTITLE] Selected transcription provider: Gemini');

    try {
        const geminiTranscript = await transcribeInstagramTranscriptWithGemini({
            inputPath: options.inputPath,
            ffmpegPath: options.ffmpegPath,
            language: options.language,
            timeoutMs: options.timeoutMs,
        });

        // Gemini text, Whisper timing (see retime-words.ts). Gemini word
        // timestamps drift early towards the end of a clip, which made the
        // caption lead grow to 2–3 s. Set REEL_SUBTITLE_GEMINI_TIMING=gemini
        // to keep Gemini's own timestamps.
        //
        // Order: re-time → coverage (voice with no words) → transcript check
        // (a second look at the audio) → translation of foreign lines → voice
        // snap → speakers. The check comes before the translation, so a
        // misheard line is never translated.
        const timed = await retimeGeminiWithWhisper(geminiTranscript, options);
        const covered = await fillSkippedSpeech(timed, options);
        const checked = await verifySpeech(covered.transcript, options, covered.tried);
        const transcript = await annotateSpeakers(
            await snapTranscriptToVoice(
                await translateForeign(checked, options),
                options,
            ),
            options,
        );

        // Сохраняем распознанные слова в диагностический NDJSON.
        // Формат WordTiming не меняется.
        await prepareOutputPath(options.outputPath);

        const ndjson = transcript.words
            .map(word => JSON.stringify(word))
            .join('\n');

        await writeFile(
            options.outputPath,
            ndjson ? `${ndjson}\n` : '',
            'utf8',
        );

        console.info('[SUBTITLE] Gemini transcription saved', {
            wordCount: transcript.words.length,
            soundCueCount: transcript.soundCues.length,
            outputPath: options.outputPath,
        });

        return transcript;
    } catch (error) {
        const fallback = (
            process.env.REEL_SUBTITLE_TRANSCRIPTION_FALLBACK ?? 'none'
        ).trim().toLowerCase();

        if (fallback !== 'whisper') {
            throw error;
        }

        console.warn(
            '[SUBTITLE] Gemini failed. Falling back to Whisper.',
            error instanceof Error ? error.message : String(error),
        );

        return transcribeWithWhisper(options);
    }
}


/**
 * Moves word timings at sentence pauses to the real voice (see voice-snap.ts).
 * Set REEL_SUBTITLE_VOICE_SNAP=off to keep the recogniser's own timestamps.
 * Any failure keeps the transcript unchanged.
 */
/**
 * Speaker labels for every word: Gemini diarization checked against a voice
 * analysis (see speaker-analysis.ts). REEL_SUBTITLE_SPEAKERS=off disables it.
 * Any failure keeps the transcript unchanged (speakers stay undefined and the
 * block builder falls back to pauses only).
 */
/**
 * Foreign lines (English, Italian, ...) are translated into the subtitle
 * language with the timing of the original sentence (translate-foreign.ts).
 * REEL_SUBTITLE_TRANSLATE=off disables it; any failure keeps the transcript.
 */
async function translateForeign(
    transcript: WhisperTranscript,
    options: WhisperOptions,
): Promise<WhisperTranscript> {
    const mode = (process.env.REEL_SUBTITLE_TRANSLATE ?? 'on').trim().toLowerCase();

    if (['off', '0', 'false', 'no'].includes(mode) || transcript.words.length === 0) {
        return transcript;
    }

    try {
        const { transcript: translated, summary } = await translateForeignSpeech(
            transcript,
            options.language ?? 'ru',
        );

        console.info('[SUBTITLE] Foreign speech', summary);

        return translated;
    } catch (error) {
        console.warn(
            '[SUBTITLE] Translation failed; foreign lines stay as transcribed.',
            error instanceof Error ? error.message : String(error),
        );

        return transcript;
    }
}

/**
 * Voice with no transcribed words (speech Gemini skipped) is transcribed again
 * in short clips (coverage-pass.ts). REEL_SUBTITLE_COVERAGE_PASS=off disables it.
 */
async function fillSkippedSpeech(
    transcript: WhisperTranscript,
    options: WhisperOptions,
): Promise<{ transcript: WhisperTranscript; tried: SpeechRange[] }> {
    const mode = (process.env.REEL_SUBTITLE_COVERAGE_PASS ?? 'on').trim().toLowerCase();

    if (['off', '0', 'false', 'no'].includes(mode) || transcript.words.length === 0) {
        return { transcript, tried: [] };
    }

    try {
        const ffmpegPath = options.ffmpegPath ?? process.env.WHISPER_FFMPEG_PATH ?? 'ffmpeg';
        const envelope = await readVoiceEnvelope(options.inputPath, ffmpegPath);
        const { transcript: filled, summary } = await fillUncoveredSpeech(
            transcript,
            envelope,
            clipTranscriber(options),
        );

        console.info('[SUBTITLE] Skipped speech re-transcribed', summary);

        // The stretches already sent are not asked about again by the check.
        return { transcript: filled, tried: summary.ranges };
    } catch (error) {
        console.warn(
            '[SUBTITLE] Coverage pass failed; transcript kept as it was.',
            error instanceof Error ? error.message : String(error),
        );

        return { transcript, tried: [] };
    }
}

/** One short clip of the video transcribed on its own (language detected automatically). */
function clipTranscriber(options: WhisperOptions): (range: SpeechRange) => Promise<WordTiming[]> {
    return async range => (await transcribeInstagramTranscriptWithGemini({
        inputPath: options.inputPath,
        ffmpegPath: options.ffmpegPath,
        language: options.language,
        timeoutMs: options.timeoutMs,
        clip: {
            startSeconds: range.start,
            durationSeconds: range.end - range.start,
        },
    })).words;
}

/**
 * Second look at the transcript (verify-transcript.ts): the audio and the text
 * go to a model together, which reports misheard words, text that is not
 * spoken and speech that has no line. Misheard words are corrected, unspoken
 * lines dropped, and each missing stretch is transcribed again as a short clip
 * (the third look; at most REEL_SUBTITLE_VERIFY_MAX_CLIPS of them, none for a
 * stretch the coverage pass already tried). REEL_SUBTITLE_VERIFY=off disables
 * it, `report` only logs; any failure keeps the transcript unchanged.
 */
async function verifySpeech(
    transcript: WhisperTranscript,
    options: WhisperOptions,
    tried: SpeechRange[],
): Promise<WhisperTranscript> {
    const mode = verifyMode();

    if (mode === 'off' || transcript.words.length === 0) {
        return transcript;
    }

    try {
        const envelope = await readVoiceEnvelope(
            options.inputPath,
            options.ffmpegPath ?? process.env.WHISPER_FFMPEG_PATH ?? 'ffmpeg',
        ).catch(error => {
            console.warn(
                '[SUBTITLE] Voice analysis for the transcript check failed; only rewrites of existing lines can apply.',
                error instanceof Error ? error.message : String(error),
            );

            return undefined;
        });
        const { words, missing, summary } = await verifyTranscript(transcript.words, {
            inputPath: options.inputPath,
            ffmpegPath: options.ffmpegPath,
            timeoutMs: options.timeoutMs,
            context: options.context,
            envelope,
            mode,
        });

        console.info('[SUBTITLE] Transcript check', summary);

        const clips = mode === 'on' ? planClips(missing, tried, maxVerifyClips()) : [];

        if (clips.length === 0) {
            return { ...transcript, words };
        }

        const filled = await transcribeRanges(words, clips, clipTranscriber(options));

        console.info('[SUBTITLE] Missing speech re-transcribed', {
            ranges: clips.map(range => ({
                start: Number(range.start.toFixed(2)),
                end: Number(range.end.toFixed(2)),
            })),
            requested: filled.requested,
            addedWords: filled.addedWords,
            replacedWords: filled.replacedWords,
            stoppedByRateLimit: filled.stoppedByRateLimit,
        });

        return { ...transcript, words: filled.words };
    } catch (error) {
        console.warn(
            '[SUBTITLE] Transcript check failed; transcript kept as it was.',
            error instanceof Error ? error.message : String(error),
        );

        return transcript;
    }
}

async function annotateSpeakers(
    transcript: WhisperTranscript,
    options: WhisperOptions,
): Promise<WhisperTranscript> {
    const mode = (process.env.REEL_SUBTITLE_SPEAKERS ?? 'on').trim().toLowerCase();

    if (['off', '0', 'false', 'no'].includes(mode) || transcript.words.length === 0) {
        return {
            ...transcript,
            words: transcript.words.map(({ speaker: _speaker, ...word }) => word),
        };
    }

    try {
        const { words, summary } = await analyseSpeakers(
            options.inputPath,
            transcript.words,
            options.ffmpegPath ?? process.env.WHISPER_FFMPEG_PATH ?? 'ffmpeg',
        );

        console.info('[SUBTITLE] Speakers detected', summary);

        return { ...transcript, words };
    } catch (error) {
        console.warn(
            '[SUBTITLE] Speaker analysis failed; blocks use pauses only.',
            error instanceof Error ? error.message : String(error),
        );
        return transcript;
    }
}

async function snapTranscriptToVoice(
    transcript: WhisperTranscript,
    options: WhisperOptions,
): Promise<WhisperTranscript> {
    const mode = (process.env.REEL_SUBTITLE_VOICE_SNAP ?? 'on').trim().toLowerCase();

    if (['off', '0', 'false', 'no'].includes(mode) || transcript.words.length === 0) {
        return transcript;
    }

    try {
        const envelope = await readVoiceEnvelope(
            options.inputPath,
            options.ffmpegPath ?? process.env.WHISPER_FFMPEG_PATH ?? 'ffmpeg',
        );
        const { words, summary } = snapWordsToVoice(transcript.words, envelope);

        console.info('[SUBTITLE] Word timings snapped to the voice', summary);

        return { ...transcript, words };
    } catch (error) {
        console.warn(
            '[SUBTITLE] Voice snapping failed; keeping recogniser timestamps.',
            error instanceof Error ? error.message : String(error),
        );
        return transcript;
    }
}

async function retimeGeminiWithWhisper(
    transcript: WhisperTranscript,
    options: WhisperOptions,
): Promise<WhisperTranscript> {
    const timingSource = (
        process.env.REEL_SUBTITLE_GEMINI_TIMING ?? 'whisper'
    ).trim().toLowerCase();

    if (timingSource !== 'whisper' || transcript.words.length === 0) {
        return transcript;
    }

    try {
        const whisperTranscript = await transcribeWithWhisper({
            ...options,
            outputPath: options.outputPath.replace(/(\.ndjson)?$/u, '.whisper-timing.ndjson'),
        });

        if (whisperTranscript.words.length === 0) {
            console.warn('[SUBTITLE] Whisper timing pass returned no words; keeping Gemini timestamps.');
            return transcript;
        }

        const { words, summary } = retimeWordsByReference(
            transcript.words,
            whisperTranscript.words,
        );

        console.info('[SUBTITLE] Gemini words re-timed with Whisper timestamps', summary);

        // Too few matches means the two transcripts disagree: keep Gemini.
        if (summary.matched < Math.max(2, Math.ceil(summary.words * 0.4))) {
            console.warn('[SUBTITLE] Too few Gemini/Whisper word matches; keeping Gemini timestamps.', summary);
            return transcript;
        }

        return { ...transcript, words };
    } catch (error) {
        console.warn(
            '[SUBTITLE] Whisper timing pass failed; keeping Gemini timestamps.',
            error instanceof Error ? error.message : String(error),
        );
        return transcript;
    }
}


/** Backward-compatible helper for callers that only need spoken words. */
export async function transcribeInstagramAudio(options: WhisperOptions): Promise<WordTiming[]> {
  return (await transcribeInstagramTranscript(options)).words;
}
