import {readFile, writeFile} from 'node:fs/promises';
import type { SoundCue, WhisperOptions, WhisperTranscript, WordTiming } from '../types.js';
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
import { needsTranslation, translateForeignSpeech } from './translate-foreign.js';
import { fillUncoveredSpeech, transcribeRanges } from './coverage-pass.js';
import { maxVerifyClips, planClips, verifyMode, verifyTranscript } from './verify-transcript.js';
import { assertLanguageCode } from '../utils/safe-input.js';
import {
    BudgetExceededError,
    budgetMs,
    remainingBudgetMs,
    runWithBudget,
    translateReserveMs,
    withBudgetReserve,
} from '../utils/budget.js';

/**
 * The local Whisper pass over a short reel takes about a minute. A pass that runs
 * much longer is stuck (or the machine is far too slow), and waiting for it would
 * use up the whole task: REEL_SUBTITLE_WHISPER_TIMEOUT_MS (30 s – 30 min, default 6 min).
 */
const DEFAULT_WHISPER_TIMEOUT_MS = 6 * 60 * 1000;

function whisperTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.REEL_SUBTITLE_WHISPER_TIMEOUT_MS;
  const value = raw === undefined || raw.trim() === '' ? Number.NaN : Number(raw);

  return Number.isFinite(value) && value >= 30_000 && value <= 30 * 60 * 1000 ? value : DEFAULT_WHISPER_TIMEOUT_MS;
}

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

  const whisperStartedAt = Date.now();

  console.info('[SUBTITLE] Starting local Whisper transcription', {
    inputPath: options.inputPath,
    language,
    queueSeconds,
    maxLen,
    useGpu,
  });

  // Inside the Gemini pipeline the pass may not outlast the time budget either.
  const remaining = remainingBudgetMs();
  if (remaining <= 0) throw new BudgetExceededError('Whisper transcription');

  await runProcess(ffmpegPath, [
    '-hide_banner', '-nostdin', '-y',
    '-i', options.inputPath,
    '-vn',
    '-af', filter,
    '-f', 'null', '-',
  ], {
    label: 'FFmpeg Whisper transcription',
    timeoutMs: Math.min(options.timeoutMs ?? whisperTimeoutMs(), remaining),
  });

  const ndjson = await readFile(options.outputPath, 'utf8');
  const transcript = parseWhisperTranscriptNdjson(ndjson);
  console.info('[SUBTITLE] Whisper transcription completed', {
    wordCount: transcript.words.length,
    soundCueCount: transcript.soundCues.length,
    durationMs: Date.now() - whisperStartedAt,
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
        // The whole Gemini pipeline has a time budget (utils/budget.ts): under an
        // overloaded Gemini the waits of the optional steps must not eat the task.
        const startedAt = Date.now();
        const budget = budgetMs();
        const transcript = await runWithBudget(budget, () => transcribeWithGeminiPipeline(options));

        console.info('[SUBTITLE] Gemini pipeline finished', {
            durationMs: Date.now() - startedAt,
            budgetMs: budget,
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


/** Runs one step of the pipeline and logs how long it took and how much of the budget is left. */
async function stage<T>(name: string, run: () => Promise<T>): Promise<T> {
    const startedAt = Date.now();

    try {
        return await run();
    } finally {
        const left = remainingBudgetMs();

        console.info('[SUBTITLE] Step finished', {
            step: name,
            durationMs: Date.now() - startedAt,
            ...(Number.isFinite(left) ? { budgetLeftMs: Math.round(left) } : {}),
        });
    }
}


/**
 * Gemini text, Whisper timing and the optional checks (see the comments in
 * transcribeInstagramTranscript). Runs under the time budget set by the caller.
 */
async function transcribeWithGeminiPipeline(options: WhisperOptions): Promise<WhisperTranscript> {
    const geminiTranscript = await stage('gemini-transcript', () => transcribeInstagramTranscriptWithGemini({
        inputPath: options.inputPath,
        ffmpegPath: options.ffmpegPath,
        language: options.language,
        timeoutMs: options.timeoutMs,
    }));

    // Diagnostics for the dry run: what Gemini heard, before the re-timing, the checks
    // and the translation. The file lies in the subtitle work directory, which is
    // deleted when the reel is finished; a failed write must not stop the pipeline.
    await writeFile(
        options.outputPath.replace(/(\.ndjson)?$/u, '.gemini-original.json'),
        `${JSON.stringify(geminiTranscript.words)}\n`,
        'utf8',
    ).catch(() => undefined);

    // Gemini text, Whisper timing (see retime-words.ts). Gemini word
    // timestamps drift early towards the end of a clip, which made the
    // caption lead grow to 2–3 s. Set REEL_SUBTITLE_GEMINI_TIMING=gemini
    // to keep Gemini's own timestamps.
    //
    // Order: re-time → coverage (voice with no words) → transcript check
    // (a second look at the audio) → translation of foreign lines → voice
    // snap → speakers. The check comes before the translation, so a
    // misheard line is never translated.
    //
    // The steps before the translation are refinements; the translation is not:
    // without it the captions come out in the wrong language. When there is
    // something to translate, those steps may use the budget only down to a
    // reserve (REEL_SUBTITLE_TRANSLATE_RESERVE_MS), so an overloaded Gemini that
    // makes them slow cannot leave the translation without time.
    const reserveMs = needsTranslation(geminiTranscript.words, options.language ?? 'ru')
        ? translateReserveMs()
        : 0;
    const checked = await withBudgetReserve(reserveMs, async () => {
        const timed = await stage('whisper-timing', () => retimeGeminiWithWhisper(geminiTranscript, options));
        const covered = await stage('coverage-pass', () => fillSkippedSpeech(timed.transcript, options, timed.soundCues));

        return stage('transcript-check', () => verifySpeech(covered.transcript, options, covered.tried));
    });
    const translated = await stage('translation', () => translateForeign(checked, options));
    const transcript = await annotateSpeakers(
        await snapTranscriptToVoice(translated, options),
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
    soundCues: SoundCue[] = [],
): Promise<{ transcript: WhisperTranscript; tried: SpeechRange[] }> {
    const mode = (process.env.REEL_SUBTITLE_COVERAGE_PASS ?? 'on').trim().toLowerCase();

    if (['off', '0', 'false', 'no'].includes(mode) || transcript.words.length === 0) {
        return { transcript, tried: [] };
    }

    try {
        const ffmpegPath = options.ffmpegPath ?? process.env.WHISPER_FFMPEG_PATH ?? 'ffmpeg';
        const envelope = await readVoiceEnvelope(options.inputPath, ffmpegPath);
        const { transcript: filled, summary, musicRanges } = await fillUncoveredSpeech(
            transcript,
            envelope,
            clipTranscriber(options),
            soundCues,
        );

        console.info('[SUBTITLE] Skipped speech re-transcribed', summary);

        // The stretches already sent are not asked about again by the check; neither
        // are the ones inside a sound cue (music), which hold no speech to find.
        return { transcript: filled, tried: [...summary.ranges, ...musicRanges] };
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

/**
 * `soundCues` are the non-speech cues Whisper heard ("[музыка]"). They are not part of the
 * result transcript (the Gemini pipeline has none); the coverage pass only uses them to
 * leave music out of its requests.
 */
async function retimeGeminiWithWhisper(
    transcript: WhisperTranscript,
    options: WhisperOptions,
): Promise<{ transcript: WhisperTranscript; soundCues: SoundCue[] }> {
    const timingSource = (
        process.env.REEL_SUBTITLE_GEMINI_TIMING ?? 'whisper'
    ).trim().toLowerCase();

    if (timingSource !== 'whisper' || transcript.words.length === 0) {
        return { transcript, soundCues: [] };
    }

    try {
        const whisperTranscript = await transcribeWithWhisper({
            ...options,
            outputPath: options.outputPath.replace(/(\.ndjson)?$/u, '.whisper-timing.ndjson'),
        });

        if (whisperTranscript.words.length === 0) {
            console.warn('[SUBTITLE] Whisper timing pass returned no words; keeping Gemini timestamps.');
            return { transcript, soundCues: whisperTranscript.soundCues };
        }

        const { words, summary } = retimeWordsByReference(
            transcript.words,
            whisperTranscript.words,
        );

        console.info('[SUBTITLE] Gemini words re-timed with Whisper timestamps', summary);

        // Too few matches means the two transcripts disagree: keep Gemini.
        if (summary.matched < Math.max(2, Math.ceil(summary.words * 0.4))) {
            console.warn('[SUBTITLE] Too few Gemini/Whisper word matches; keeping Gemini timestamps.', summary);
            return { transcript, soundCues: whisperTranscript.soundCues };
        }

        return { transcript: { ...transcript, words }, soundCues: whisperTranscript.soundCues };
    } catch (error) {
        console.warn(
            '[SUBTITLE] Whisper timing pass failed; keeping Gemini timestamps.',
            error instanceof Error ? error.message : String(error),
        );
        return { transcript, soundCues: [] };
    }
}


/** Backward-compatible helper for callers that only need spoken words. */
export async function transcribeInstagramAudio(options: WhisperOptions): Promise<WordTiming[]> {
  return (await transcribeInstagramTranscript(options)).words;
}
