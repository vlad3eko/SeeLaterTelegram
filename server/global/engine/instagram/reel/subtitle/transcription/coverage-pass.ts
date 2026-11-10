import type { WhisperTranscript, WordTiming } from '../types.js';
import { isRateLimitError } from '../utils/rate-limit.js';
import {
    findUncoveredSpeech,
    type SpeechRange,
    type VoiceEnvelope,
} from './voice-snap.js';

/**
 * Coverage pass. The first Gemini request can skip whole stretches of speech
 * (measured: a Russian reel with English lines came back with 12 words and
 * nothing after 11.7 s). The voice envelope shows where the voice sounds with
 * no word on it; those stretches are sent to Gemini again as separate short
 * clips (language detected automatically) and the words found are merged into
 * the transcript before translation.
 *
 * A short range is not sent: a breath, a laugh or a noise (measured: a range of
 * 1.2 s came back empty) costs the same request as a whole skipped line.
 *
 * REEL_SUBTITLE_COVERAGE_PASS=off disables it. Any failure of a clip keeps
 * the transcript as it was.
 */
export type CoverageSummary = {
    ranges: Array<{ start: number; end: number }>;
    requested: number;
    addedWords: number;
    /** Words of the first request that the clip transcript replaced. */
    replacedWords: number;
    /** True when the API quota ended and the remaining clips were skipped. */
    stoppedByRateLimit: boolean;
    /** Ranges too short to be worth a request. */
    skippedShort: number;
};

const REPLACE_MIN_SHARE = 0.5;
const DEFAULT_MAX_CLIPS = 3;

/**
 * Each clip is one more API request (the free Gemini tier allows 25 a day), so
 * the number is capped: REEL_SUBTITLE_COVERAGE_MAX_CLIPS (1–6, default 3).
 * Nearby ranges are merged to fit.
 */
function maxClips(): number {
    const value = Number(process.env.REEL_SUBTITLE_COVERAGE_MAX_CLIPS);

    return Number.isInteger(value) && value >= 1 && value <= 6 ? value : DEFAULT_MAX_CLIPS;
}

/**
 * Ranges come padded by 0.4 s on both sides (voice-snap.ts), so 1.8 s is about
 * a second of voice. REEL_SUBTITLE_COVERAGE_MIN_SECONDS changes it; 0 sends
 * every range.
 */
const DEFAULT_MIN_RANGE_SECONDS = 1.8;

export function minRangeSeconds(env: NodeJS.ProcessEnv = process.env): number {
    const raw = env.REEL_SUBTITLE_COVERAGE_MIN_SECONDS;
    const value = raw === undefined || raw.trim() === '' ? Number.NaN : Number(raw);

    return Number.isFinite(value) && value >= 0 && value <= 10 ? value : DEFAULT_MIN_RANGE_SECONDS;
}

/** Pure: the ranges long enough to be worth a request. */
export function dropShortRanges(ranges: SpeechRange[], minSeconds: number): SpeechRange[] {
    // The small tolerance keeps a range of exactly `minSeconds` (6.8 - 5 is 1.7999…) in.
    return ranges.filter(range => range.end - range.start >= minSeconds - 1e-6);
}

const centreOf = (word: WordTiming): number => (word.start + word.end) / 2;

/** Pure: adds `extra` words that do not sit on an already transcribed word. */
export function mergeCoverageWords(
    existing: WordTiming[],
    extra: WordTiming[],
): WordTiming[] {
    const accepted = extra.filter(word => {
        const centre = centreOf(word);

        return !existing.some(other => centre > other.start && centre < other.end);
    });

    return [...existing, ...accepted].sort((a, b) => a.start - b.start || a.end - b.end);
}

/**
 * Pure: the clip transcript REPLACES the words of the first request that lie
 * in its range. The first request may have rendered the same speech in a
 * different way (a forced-language request turns English into Russian) and
 * with other timing, so adding the clip words beside them gave doubled,
 * interleaved captions ("МЫ МЕРТВЫ / МЁРТВ", "СЕБЯ ТАК ЕШЬ / ИГРАЕТ").
 * When the clip returns clearly fewer words than it would replace, the old
 * words are kept and only the non-overlapping clip words are added.
 */
export function replaceCoverageWords(
    existing: WordTiming[],
    extra: WordTiming[],
    range: SpeechRange,
): { words: WordTiming[]; removed: number } {
    const inside = (word: WordTiming): boolean =>
        centreOf(word) >= range.start && centreOf(word) <= range.end;
    const removable = existing.filter(inside);

    if (extra.length < removable.length * REPLACE_MIN_SHARE) {
        return { words: mergeCoverageWords(existing, extra), removed: 0 };
    }

    const kept = existing.filter(word => !inside(word));
    const added = extra.filter(inside);

    return {
        words: [...kept, ...added].sort((a, b) => a.start - b.start || a.end - b.end),
        removed: removable.length,
    };
}

export type RangeTranscription = {
    words: WordTiming[];
    requested: number;
    addedWords: number;
    replacedWords: number;
    stoppedByRateLimit: boolean;
};

/**
 * Transcribes each range as its own clip (one request per range) and merges
 * what is found into `words`. A clip that fails or finds nothing leaves its
 * range as it was; a used-up quota stops the loop. Shared by the coverage pass
 * and the transcript check (verify-transcript.ts).
 */
export async function transcribeRanges(
    words: WordTiming[],
    ranges: SpeechRange[],
    transcribeClip: (range: SpeechRange) => Promise<WordTiming[]>,
): Promise<RangeTranscription> {
    const result: RangeTranscription = {
        words,
        requested: 0,
        addedWords: 0,
        replacedWords: 0,
        stoppedByRateLimit: false,
    };

    for (const range of ranges) {
        result.requested += 1;

        try {
            const found = await transcribeClip(range);

            if (found.length === 0) continue;

            const { words: merged, removed } = replaceCoverageWords(result.words, found, range);

            result.addedWords += merged.length - result.words.length + removed;
            result.replacedWords += removed;
            result.words = merged;
        } catch (error) {
            if (isRateLimitError(error)) {
                // The quota is used up: further clips would only fail.
                result.stoppedByRateLimit = true;
                console.warn('[SUBTITLE] API rate limit reached; remaining clips skipped.');
                break;
            }

            console.warn(
                '[SUBTITLE] Clip gave no words.',
                { start: range.start, end: range.end },
                error instanceof Error ? error.message.slice(0, 200) : String(error),
            );
        }
    }

    return result;
}

export async function fillUncoveredSpeech(
    transcript: WhisperTranscript,
    envelope: VoiceEnvelope,
    transcribeClip: (range: SpeechRange) => Promise<WordTiming[]>,
): Promise<{ transcript: WhisperTranscript; summary: CoverageSummary }> {
    const found = findUncoveredSpeech(transcript.words, envelope, maxClips());
    const ranges = dropShortRanges(found, minRangeSeconds());
    const result = await transcribeRanges(transcript.words, ranges, transcribeClip);
    const summary: CoverageSummary = {
        ranges: ranges.map(range => ({
            start: Number(range.start.toFixed(2)),
            end: Number(range.end.toFixed(2)),
        })),
        requested: result.requested,
        addedWords: result.addedWords,
        replacedWords: result.replacedWords,
        stoppedByRateLimit: result.stoppedByRateLimit,
        skippedShort: found.length - ranges.length,
    };

    return { transcript: { ...transcript, words: result.words }, summary };
}
