import type { SoundCue, WhisperTranscript, WordTiming } from '../types.js';
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
    /** Ranges that lie in a sound cue of Whisper (music, applause): no speech to look for. */
    skippedSoundCue: number;
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

/**
 * A range that mostly lies inside a sound cue of Whisper ("[музыка]", "[аплодисменты]")
 * holds no speech that Gemini skipped: a clip of it comes back empty or with an
 * invented line (measured: a 8.7 s range inside "[музыка]" came back empty, another one
 * answered with a single Chinese character), and costs a request all the same.
 * REEL_SUBTITLE_COVERAGE_SKIP_CUES=off sends such ranges anyway.
 */
const SOUND_CUE_MIN_SHARE = 0.7;

export function skipCueRanges(env: NodeJS.ProcessEnv = process.env): boolean {
    return !['off', '0', 'false', 'no'].includes(
        (env.REEL_SUBTITLE_COVERAGE_SKIP_CUES ?? 'on').trim().toLowerCase(),
    );
}

/** Pure: splits `ranges` into the ones worth a request and the ones inside sound cues. */
export function splitRangesBySoundCues(
    ranges: SpeechRange[],
    cues: Array<Pick<SoundCue, 'start' | 'end'>>,
): { speech: SpeechRange[]; inCues: SpeechRange[] } {
    const speech: SpeechRange[] = [];
    const inCues: SpeechRange[] = [];

    for (const range of ranges) {
        const length = range.end - range.start;
        // Cues are separate, so the overlaps add up (a cue never overlaps another one).
        const covered = cues.reduce(
            (sum, cue) => sum + Math.max(0, Math.min(cue.end, range.end) - Math.max(cue.start, range.start)),
            0,
        );

        if (length > 0 && covered / length >= SOUND_CUE_MIN_SHARE) {
            inCues.push(range);
        } else {
            speech.push(range);
        }
    }

    return { speech, inCues };
}

const centreOf = (word: WordTiming): number => (word.start + word.end) / 2;

const echoToken = (text: string): string => text
    .toLocaleUpperCase('ru-RU')
    .replace(/Ё/gu, 'Е')
    .replace(/[^\p{L}\p{N}]+/gu, '');

/** Seconds: how far a leftover may sit from the clip words it repeats. */
const ECHO_MAX_DISTANCE_SECONDS = 3;

/**
 * Pure: drops words of `kept` that repeat, one for one, the first or the last words
 * of `added` right next to the replaced range. They are leftovers of the first
 * request that sat just outside the range (the centre of a word cut by the range
 * edge, or a word with a wrong timestamp), so the clip transcript brought the
 * same line a second time ("Ты Питер" before "Ты Питер Паркер?").
 */
export function dropEchoedWords(kept: WordTiming[], added: WordTiming[]): WordTiming[] {
    if (added.length === 0) return kept;

    const sortedAdded = [...added].sort((a, b) => a.start - b.start || a.end - b.end);
    const addedTokens = sortedAdded.map(word => echoToken(word.text));
    const ordered = [...kept].sort((a, b) => a.start - b.start || a.end - b.end);
    const firstStart = sortedAdded[0]!.start;
    const lastStart = sortedAdded[sortedAdded.length - 1]!.start;
    const drop = new Set<WordTiming>();

    const before = ordered.filter(word => word.start < firstStart);

    for (let count = Math.min(before.length, addedTokens.length); count >= 1; count -= 1) {
        const tail = before.slice(-count);

        if (firstStart - tail[0]!.start > ECHO_MAX_DISTANCE_SECONDS) continue;

        if (tail.every((word, offset) => {
            const token = echoToken(word.text);

            return token !== '' && token === addedTokens[offset];
        })) {
            tail.forEach(word => drop.add(word));
            break;
        }
    }

    const after = ordered.filter(word => word.start > lastStart);

    for (let count = Math.min(after.length, addedTokens.length); count >= 1; count -= 1) {
        const head = after.slice(0, count);

        if (head[count - 1]!.start - lastStart > ECHO_MAX_DISTANCE_SECONDS) continue;

        const tokens = addedTokens.slice(-count);

        if (head.every((word, offset) => {
            const token = echoToken(word.text);

            return token !== '' && token === tokens[offset];
        })) {
            head.forEach(word => drop.add(word));
            break;
        }
    }

    return drop.size === 0 ? kept : kept.filter(word => !drop.has(word));
}

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

    const added = extra.filter(inside);
    const keptBefore = existing.filter(word => !inside(word));
    const kept = dropEchoedWords(keptBefore, added);

    return {
        words: [...kept, ...added].sort((a, b) => a.start - b.start || a.end - b.end),
        removed: removable.length + keptBefore.length - kept.length,
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
    soundCues: Array<Pick<SoundCue, 'start' | 'end'>> = [],
): Promise<{ transcript: WhisperTranscript; summary: CoverageSummary; musicRanges: SpeechRange[] }> {
    const found = findUncoveredSpeech(transcript.words, envelope, maxClips());
    const longEnough = dropShortRanges(found, minRangeSeconds());
    const { speech: ranges, inCues } = skipCueRanges()
        ? splitRangesBySoundCues(longEnough, soundCues)
        : { speech: longEnough, inCues: [] as SpeechRange[] };
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
        skippedShort: found.length - longEnough.length,
        skippedSoundCue: inCues.length,
    };

    return { transcript: { ...transcript, words: result.words }, summary, musicRanges: inCues };
}
