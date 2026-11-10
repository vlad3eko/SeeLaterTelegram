import type { WordTiming } from '../types.js';

/**
 * Checks for values that come from outside the module (CLI flags, the caller,
 * the recognisers) before they reach a file path, an FFmpeg filter graph, a
 * prompt or the ASS file.
 */

const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const LANGUAGE = /^(?:auto|[A-Za-z]{2,3}(?:[-_][A-Za-z0-9]{2,8})?)$/u;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u2028\u2029]/gu;

const MAX_WORD_CHARACTERS = 64;
const MAX_SPEAKER_CHARACTERS = 32;
const MAX_TRANSCRIPT_WORDS = 20_000;

/** A run id becomes a directory name: no separators, no `..`. */
export function assertSafeRunId(runId: string): string {
    if (!RUN_ID.test(runId) || runId.includes('..')) {
        throw new Error(
            `[SUBTITLE] Unsafe runId "${runId.slice(0, 40)}": only letters, digits, ".", "_" and "-" are allowed.`,
        );
    }

    return runId;
}

/** A language code is put into an FFmpeg filter graph and into prompts. */
export function assertLanguageCode(language: string): string {
    if (!LANGUAGE.test(language)) {
        throw new Error(
            `[SUBTITLE] Invalid language code "${language.slice(0, 20)}": expected "ru", "en-US", "auto", ...`,
        );
    }

    return language;
}

export function stripControlCharacters(value: string): string {
    return value.replace(CONTROL_CHARACTERS, ' ').replace(/\s{2,}/gu, ' ').trim();
}

/**
 * Pure: a transcript that is safe for the layout and ASS steps. Words with
 * non-finite or negative times, empty text or a start beyond the video are
 * dropped; times are clamped to the video; text and speaker labels lose
 * control characters and are length-limited; the list is length-limited.
 */
export function sanitizeWords(
    words: WordTiming[],
    durationSeconds: number,
): { words: WordTiming[]; dropped: number } {
    const limit = Number.isFinite(durationSeconds) && durationSeconds > 0
        ? durationSeconds + 1
        : Number.POSITIVE_INFINITY;
    const result: WordTiming[] = [];

    for (const word of words) {
        if (result.length >= MAX_TRANSCRIPT_WORDS) break;

        const text = stripControlCharacters(String(word.text ?? '')).slice(0, MAX_WORD_CHARACTERS);
        const start = Number(word.start);
        const end = Number(word.end);

        if (!text || !Number.isFinite(start) || !Number.isFinite(end)) continue;
        if (start < 0 || end <= start || start >= limit) continue;

        const { speaker: rawSpeaker, ...rest } = word;
        const speaker = rawSpeaker
            ? stripControlCharacters(String(rawSpeaker)).slice(0, MAX_SPEAKER_CHARACTERS)
            : undefined;

        result.push({
            ...rest,
            text,
            start,
            end: Math.min(end, limit),
            ...(speaker ? { speaker } : {}),
        });
    }

    return { words: result, dropped: words.length - result.length };
}
