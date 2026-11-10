import { spawn } from 'node:child_process';
import type { WordTiming } from '../types.js';

/**
 * Snaps word timings to the real voice at sentence boundaries.
 *
 * Why: speech-to-text word timestamps absorb every pause into the neighbouring
 * words. The word after a pause starts early (by the whole pause) and the last
 * word before a pause is stretched over it (measured on a 40 s preview:
 * "Но мы же все дети" 11.98 s vs the voice at 13.45 s; "ВЫ НЕ ДЕТИ" until
 * 17.42 s vs the voice ending at 16.25 s). Captions then show up 1–2 s too
 * early or hang on screen after the voice has stopped.
 *
 * The audio is analysed once: a voice envelope (band-passed mid channel minus
 * side channel, so centred speech stays and wide music is reduced) gives the
 * silences. At every silence that follows a punctuated word:
 *   - that word is cut at the start of the silence;
 *   - the words after it start at the end of the silence (voice onset).
 * Words are only ever moved at such boundaries, never inside a sentence, and
 * only by a bounded amount, so a weak voice cannot reshuffle a whole sentence.
 */
export type VoiceEnvelope = {
    hopSeconds: number;
    /** Normalised voice level per hop (≈1 at the 95th percentile). */
    level: number[];
};

export type VoiceSnapSummary = {
    silences: number;
    boundaries: number;
    movedWords: number;
    /** Words moved into a quiet island inside a pause. */
    movedToIsland: number;
    /** Words re-assigned from a pause to a voice segment. */
    relocated: number;
    /** Words whose end was cut to the end of the voice. */
    trimmed: number;
};

const SAMPLE_RATE = 16_000;
/** Longest audio the voice analysis reads into memory. */
const MAX_ANALYSIS_SECONDS = 1800;
const HOP_SECONDS = 0.05;
const ACTIVE_LEVEL = 0.2;
const MIN_SILENCE_SECONDS = 0.25;
const MIN_ACTIVE_SECONDS = 0.3;
const MAX_SHIFT_SECONDS = 2.5;
const MIN_WORD_SECONDS = 0.06;
/** Quiet speech inside a long pause (a murmured "в то"): see findWeakIsland. */
const WEAK_LEVEL = 0.07;
const WEAK_OVER_FLOOR = 1.8;
const WEAK_MIN_SECONDS = 0.15;
const WEAK_MAX_SECONDS = 0.9;
const WEAK_BRIDGE_HOPS = 2;
const WEAK_MIN_SILENCE_SECONDS = 0.8;
const PUNCTUATION_END = /[.!?…,;:][»”’"')\]]*$/u;

type Biquad = { b0: number; b1: number; b2: number; a1: number; a2: number };

function biquad(type: 'hp' | 'lp', frequency: number): Biquad {
    const w0 = 2 * Math.PI * frequency / SAMPLE_RATE;
    const alpha = Math.sin(w0) / (2 * Math.SQRT1_2);
    const cos = Math.cos(w0);
    const a0 = 1 + alpha;
    const raw = type === 'hp'
        ? { b0: (1 + cos) / 2, b1: -(1 + cos), b2: (1 + cos) / 2 }
        : { b0: (1 - cos) / 2, b1: 1 - cos, b2: (1 - cos) / 2 };

    return {
        b0: raw.b0 / a0,
        b1: raw.b1 / a0,
        b2: raw.b2 / a0,
        a1: -2 * cos / a0,
        a2: (1 - alpha) / a0,
    };
}

function filter(input: Float32Array, coefficients: Biquad[]): Float32Array {
    let current = input;

    for (const c of coefficients) {
        const output = new Float32Array(current.length);
        let x1 = 0;
        let x2 = 0;
        let y1 = 0;
        let y2 = 0;

        for (let index = 0; index < current.length; index += 1) {
            const x0 = current[index] ?? 0;
            const y0 = c.b0 * x0 + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
            output[index] = y0;
            x2 = x1;
            x1 = x0;
            y2 = y1;
            y1 = y0;
        }

        current = output;
    }

    return current;
}

function hopRms(signal: Float32Array, hopSamples: number): number[] {
    const result: number[] = [];

    for (let start = 0; start + hopSamples <= signal.length; start += hopSamples) {
        let sum = 0;
        for (let index = start; index < start + hopSamples; index += 1) {
            const value = signal[index] ?? 0;
            sum += value * value;
        }
        result.push(Math.sqrt(sum / hopSamples));
    }

    return result;
}

/** Pure: voice envelope of interleaved stereo 16-bit PCM at 16 kHz. */
export function computeVoiceEnvelope(pcm: Int16Array): VoiceEnvelope {
    const frames = Math.floor(pcm.length / 2);
    const mid = new Float32Array(frames);
    const side = new Float32Array(frames);

    for (let index = 0; index < frames; index += 1) {
        const left = pcm[index * 2] ?? 0;
        const right = pcm[index * 2 + 1] ?? 0;
        mid[index] = (left + right) / 2;
        side[index] = (left - right) / 2;
    }

    const band = [biquad('hp', 200), biquad('lp', 3500)];
    const hopSamples = Math.round(SAMPLE_RATE * HOP_SECONDS);
    const midLevel = hopRms(filter(mid, band), hopSamples);
    const sideLevel = hopRms(filter(side, band), hopSamples);
    const voice = midLevel.map((value, index) =>
        Math.max(0, value - (sideLevel[index] ?? 0)),
    );

    const sorted = [...voice].sort((a, b) => a - b);
    const reference = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
    const scale = reference > 0 ? 1 / reference : 0;

    return { hopSeconds: HOP_SECONDS, level: voice.map(value => value * scale) };
}

export async function readVoiceEnvelope(
    inputPath: string,
    ffmpegPath = 'ffmpeg',
    timeoutMs = 120_000,
): Promise<VoiceEnvelope> {
    const chunks: Buffer[] = [];

    await new Promise<void>((resolve, reject) => {
        const child = spawn(ffmpegPath, [
            '-hide_banner', '-nostdin', '-loglevel', 'error',
            '-i', inputPath,
            '-vn', '-ac', '2', '-ar', String(SAMPLE_RATE),
            '-f', 's16le', '-',
        ], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
        const timer = setTimeout(() => {
            child.kill();
            reject(new Error('Voice envelope extraction timed out.'));
        }, timeoutMs);
        let stderr = '';

        let bytes = 0;

        child.stdout.on('data', (chunk: Buffer) => {
            bytes += chunk.length;
            // Stereo 16-bit audio: a runaway input must not fill the memory.
            if (bytes > SAMPLE_RATE * 4 * MAX_ANALYSIS_SECONDS) {
                child.kill();
                clearTimeout(timer);
                reject(new Error(`Audio is longer than ${MAX_ANALYSIS_SECONDS} s; voice analysis skipped.`));
                return;
            }
            chunks.push(chunk);
        });
        child.stderr.on('data', (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(0, 2000); });
        child.once('error', error => { clearTimeout(timer); reject(error); });
        child.once('close', code => {
            clearTimeout(timer);
            if (code === 0) resolve();
            else reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(0, 300)}`));
        });
    });

    const buffer = Buffer.concat(chunks);
    // A copy: a Buffer view may start at an odd offset, which Int16Array rejects.
    const pcm = new Int16Array(
        buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + (buffer.byteLength & ~1)),
    );

    return computeVoiceEnvelope(pcm);
}

type Silence = { start: number; end: number };

function findVoiceSegments(envelope: VoiceEnvelope): Silence[] {
    const { level, hopSeconds } = envelope;
    const segments: Silence[] = [];
    let start: number | undefined;
    let last = 0;
    let gap = 0;

    level.forEach((value, index) => {
        const time = index * hopSeconds;

        if (value >= ACTIVE_LEVEL) {
            if (start === undefined) start = time;
            last = time + hopSeconds;
            gap = 0;
        } else if (start !== undefined) {
            gap += hopSeconds;
            if (gap > MIN_SILENCE_SECONDS) {
                if (last - start >= MIN_ACTIVE_SECONDS) segments.push({ start, end: last });
                start = undefined;
            }
        }
    });

    if (start !== undefined && last - start >= MIN_ACTIVE_SECONDS) {
        segments.push({ start, end: last });
    }

    return segments;
}

function findSilences(envelope: VoiceEnvelope): Silence[] {
    const segments = findVoiceSegments(envelope);
    // Silences are the gaps between voice segments.
    const silences: Silence[] = [];
    for (let index = 0; index + 1 < segments.length; index += 1) {
        const current = segments[index];
        const next = segments[index + 1];
        if (current && next && next.start - current.end >= MIN_SILENCE_SECONDS) {
            silences.push({ start: current.end, end: next.start });
        }
    }

    return silences;
}

/**
 * A weak but clearly audible island inside a long silence: quiet speech that
 * the 0.2 voice threshold ignores. It must stay clear of both ends of the
 * silence (otherwise it is just the fade of the neighbouring speech).
 */
function findWeakIsland(
    envelope: VoiceEnvelope,
    silence: Silence,
): Silence | undefined {
    if (silence.end - silence.start < WEAK_MIN_SILENCE_SECONDS) return undefined;

    const { level, hopSeconds } = envelope;
    const from = Math.ceil((silence.start + 0.3) / hopSeconds);
    const to = Math.floor((silence.end - 0.15) / hopSeconds);

    if (to - from < 3) return undefined;

    const window = level.slice(from, to + 1).sort((a, b) => a - b);
    const floor = window[Math.floor(window.length / 2)] ?? 0;
    const threshold = Math.max(WEAK_LEVEL, floor * WEAK_OVER_FLOOR);
    let best: Silence | undefined;
    let start: number | undefined;
    let last = 0;
    let gap = 0;

    const close = () => {
        if (start === undefined) return;
        const length = last - start;
        if (
            length >= WEAK_MIN_SECONDS &&
            length <= WEAK_MAX_SECONDS &&
            (!best || length > best.end - best.start)
        ) {
            best = { start, end: last };
        }
        start = undefined;
    };

    for (let index = from; index <= to; index += 1) {
        const time = index * hopSeconds;
        if ((level[index] ?? 0) >= threshold) {
            if (start === undefined) start = time;
            last = time + hopSeconds;
            gap = 0;
        } else if (start !== undefined) {
            gap += 1;
            if (gap > WEAK_BRIDGE_HOPS) close();
        }
    }
    close();

    return best;
}

function letters(word: WordTiming): number {
    return Math.max(1, Array.from(word.text.replace(/[^\p{L}\p{N}]+/gu, '')).length);
}

/** Time a spoken word needs at a brisk speech rate. */
function naturalSeconds(word: WordTiming): number {
    return Math.min(0.4, Math.max(0.08, 0.045 * letters(word) + 0.06));
}


// ---------------------------------------------------------------------------
// Voice-segment alignment: words stranded inside a pause.
//
// The recogniser also absorbs pauses that carry no punctuation ("И этой …
// женщине известно всё": the words after the pause were placed 1.4 s early).
// Every voice segment (a stretch of speech between pauses) can hold only so
// many syllables at the speaker's own tempo, so the words are re-assigned to
// the segments by a monotone dynamic programme:
//   cost = 0.3 · (distance of each word from its segment)
//        + tempo mismatch of each segment (syllables per second against the
//          tempo measured on this very clip)
//        + a penalty for leaving a long segment empty.
// Only words that clearly sit in a pause are moved, and only to the segment
// the programme picked; everything else keeps its timing.
// ---------------------------------------------------------------------------

const VOWELS = /[аеёиоуыэюяaeiouy]/giu;
const DEFAULT_SYLLABLES_PER_SECOND = 5.2;
const DISTANCE_WEIGHT = 0.3;
const TEMPO_TOLERANCE = 0.3;
const TEMPO_FAST_WEIGHT = 3.5;
const TEMPO_SLOW_WEIGHT = 1.2;
const EMPTY_SEGMENT_MIN_SECONDS = 0.5;
const EMPTY_SEGMENT_WEIGHT = 1.5;
const STRANDED_MIN_DISTANCE_SECONDS = 0.15;
const SEGMENT_MIN_SECONDS = 0.2;
const MIN_MOVE_GAIN = 0.35;

function syllables(word: WordTiming): number {
    const vowels = word.text.match(VOWELS)?.length ?? 0;

    return vowels > 0 ? vowels : Math.max(0.4, letters(word) / 3);
}

function segmentDistance(time: number, segment: Silence): number {
    if (time < segment.start) return segment.start - time;
    if (time > segment.end) return time - segment.end;

    return 0;
}

function medianOf(values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b);

    return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

/** Pure: re-assigns stranded words to voice segments (see the block above). */
export function alignWordsToVoiceSegments(
    words: WordTiming[],
    segments: Silence[],
    audioEnd: number,
): number {
    const n = words.length;
    const m = segments.length;

    if (n === 0 || m < 2) return 0;

    const mid = words.map(word => (word.start + word.end) / 2);
    const syl = words.map(syllables);
    const prefixSyl = [0];
    syl.forEach(value => prefixSyl.push((prefixSyl.at(-1) ?? 0) + value));

    // Tempo of this clip: syllables per second of long, well-aligned segments.
    const rates: number[] = [];
    segments.forEach(segment => {
        const duration = segment.end - segment.start;
        if (duration < 1) return;
        const inside = words
            .map((_, index) => index)
            .filter(index => segmentDistance(mid[index] ?? 0, segment) === 0);
        if (inside.length < 3) return;
        const total = inside.reduce((sum, index) => sum + (syl[index] ?? 0), 0);
        rates.push(total / duration);
    });
    const tempo = rates.length >= 2
        ? Math.min(7.5, Math.max(3.5, medianOf(rates)))
        : DEFAULT_SYLLABLES_PER_SECOND;

    const distancePrefix = segments.map(segment => {
        const prefix = [0];
        mid.forEach(time => prefix.push((prefix.at(-1) ?? 0) + segmentDistance(time, segment)));
        return prefix;
    });

    const segmentCost = (j: number, from: number, to: number): number => {
        const segment = segments[j]!;
        const duration = segment.end - segment.start;
        const count = to - from;

        if (count === 0) {
            return duration >= EMPTY_SEGMENT_MIN_SECONDS
                ? EMPTY_SEGMENT_WEIGHT * duration
                : 0;
        }

        const distance = (distancePrefix[j]![to] ?? 0) - (distancePrefix[j]![from] ?? 0);
        const rate = ((prefixSyl[to] ?? 0) - (prefixSyl[from] ?? 0)) / Math.max(duration, 0.1);
        const deviation = Math.log(rate / tempo);
        // Speech cannot be faster than ~1.4× the clip's tempo, but it can be
        // slower (stretched words, pauses inside). A segment cut by the start
        // or the end of the clip says nothing about the slow side.
        const cut = segment.start <= 0.1 || segment.end >= audioEnd - 0.1;
        const mismatch = deviation > 0
            ? Math.max(0, deviation - TEMPO_TOLERANCE) * TEMPO_FAST_WEIGHT
            : cut
                ? 0
                : Math.max(0, -deviation - TEMPO_TOLERANCE) * TEMPO_SLOW_WEIGHT;

        return DISTANCE_WEIGHT * distance + duration * mismatch;
    };

    // f[j][i]: best cost of assigning the first i words to the first j+1 segments.
    const infinity = Number.POSITIVE_INFINITY;
    const f: number[][] = Array.from({ length: m }, () => new Array<number>(n + 1).fill(infinity));
    const back: number[][] = Array.from({ length: m }, () => new Array<number>(n + 1).fill(0));

    for (let i = 0; i <= n; i += 1) f[0]![i] = segmentCost(0, 0, i);

    for (let j = 1; j < m; j += 1) {
        for (let i = 0; i <= n; i += 1) {
            for (let k = 0; k <= i; k += 1) {
                const value = (f[j - 1]![k] ?? infinity) + segmentCost(j, k, i);
                if (value < (f[j]![i] ?? infinity)) {
                    f[j]![i] = value;
                    back[j]![i] = k;
                }
            }
        }
    }

    const assigned = new Array<number>(n).fill(0);
    let end = n;

    for (let j = m - 1; j >= 0; j -= 1) {
        const start = j === 0 ? 0 : back[j]![end] ?? 0;
        for (let index = start; index < end; index += 1) assigned[index] = j;
        end = start;
    }

    // Words that really sit in a pause and were given another segment.
    const home = mid.map(time => {
        let best = 0;
        let bestDistance = infinity;
        segments.forEach((segment, index) => {
            const distance = segmentDistance(time, segment);
            if (distance < bestDistance) {
                bestDistance = distance;
                best = index;
            }
        });
        return { index: best, distance: bestDistance };
    });
    const moved = new Set<number>();

    for (let index = 0; index < n; index += 1) {
        const target = assigned[index] ?? 0;
        const homeInfo = home[index]!;
        if (
            target !== homeInfo.index &&
            // The word really sits in a pause, not in a voice segment.
            homeInfo.distance >= STRANDED_MIN_DISTANCE_SECONDS &&
            segmentDistance(mid[index] ?? 0, segments[target]!) >= STRANDED_MIN_DISTANCE_SECONDS
        ) {
            moved.add(index);
        }
    }

    if (moved.size === 0) return 0;

    // Keep a move only when it clearly improves the fit (tempo + distance):
    // compare each run of moved words with leaving it in its home segment.
    const ranges = segments.map((_, j) => {
        const members = assigned
            .map((value, index) => (value === j ? index : -1))
            .filter(index => index >= 0);
        return members.length > 0
            ? { lo: members[0]!, hi: members[members.length - 1]! + 1 }
            : { lo: 0, hi: 0 };
    });
    const sorted = [...moved].sort((a, b) => a - b);
    let runStart = 0;

    while (runStart < sorted.length) {
        let runEnd = runStart;
        while (
            runEnd + 1 < sorted.length &&
            sorted[runEnd + 1] === sorted[runEnd]! + 1 &&
            assigned[sorted[runEnd + 1]!] === assigned[sorted[runStart]!]
        ) {
            runEnd += 1;
        }

        const first = sorted[runStart]!;
        const last = sorted[runEnd]!;
        const target = assigned[first] ?? 0;
        const homeSegment = home[first]!.index;
        let gain = -1;

        if (Math.abs(target - homeSegment) === 1) {
            const dpCost =
                segmentCost(homeSegment, ranges[homeSegment]!.lo, ranges[homeSegment]!.hi) +
                segmentCost(target, ranges[target]!.lo, ranges[target]!.hi);
            const altHome = target > homeSegment
                ? { lo: ranges[homeSegment]!.lo, hi: last + 1 }
                : { lo: first, hi: ranges[homeSegment]!.hi };
            const altTarget = target > homeSegment
                ? { lo: last + 1, hi: ranges[target]!.hi }
                : { lo: ranges[target]!.lo, hi: first };
            const altCost =
                segmentCost(homeSegment, altHome.lo, Math.max(altHome.lo, altHome.hi)) +
                segmentCost(target, altTarget.lo, Math.max(altTarget.lo, altTarget.hi));
            gain = altCost - dpCost;
        }

        if (gain < MIN_MOVE_GAIN) {
            for (let index = runStart; index <= runEnd; index += 1) moved.delete(sorted[index]!);
        }

        runStart = runEnd + 1;
    }

    if (moved.size === 0) return 0;

    for (let j = 0; j < m; j += 1) {
        const segment = segments[j]!;
        const members = words
            .map((_, index) => index)
            .filter(index => assigned[index] === j);
        const movedIn = members.filter(index => moved.has(index));

        if (movedIn.length === 0) continue;

        const totalSyl = members.reduce((sum, index) => sum + (syl[index] ?? 0), 0);
        const perSyllable = Math.min(
            0.35,
            Math.max(0.1, Math.max(segment.end - segment.start, SEGMENT_MIN_SECONDS) / totalSyl),
        );
        const durationOf = (index: number) => Math.max(0.08, (syl[index] ?? 1) * perSyllable);
        const natives = members.filter(index => !moved.has(index));
        const firstNative = natives[0];
        const leading = movedIn.filter(index => firstNative === undefined || index < firstNative);
        const trailing = movedIn.filter(index => !leading.includes(index));

        // Moved words that come first start with the voice.
        let cursor = segment.start;
        leading.forEach(index => {
            const word = words[index]!;
            const duration = durationOf(index);
            word.start = cursor;
            word.end = cursor + duration;
            cursor += duration;
        });
        // Native words that would now overlap are pushed on.
        for (const index of natives) {
            const word = words[index]!;
            if (word.start >= cursor - 1e-6) break;
            const shift = cursor - word.start;
            word.start += shift;
            word.end = Math.max(word.end + shift, word.start + MIN_WORD_SECONDS);
            cursor = word.start + Math.min(durationOf(index), word.end - word.start);
        }

        // Moved words that come last end with the voice.
        let tail = Math.max(segment.end, cursor);
        for (const index of [...trailing].reverse()) {
            const word = words[index]!;
            const duration = durationOf(index);
            word.end = tail;
            word.start = tail - duration;
            tail -= duration;
        }
        // Native words that would overlap them end earlier.
        for (const index of [...natives].reverse()) {
            const word = words[index]!;
            if (word.end <= tail + 1e-6) break;
            word.end = Math.max(word.start + MIN_WORD_SECONDS, tail);
            tail = word.start;
        }
    }

    return moved.size;
}

/** Pure: a word that runs on into a pause ends where the voice stops. */
export function trimWordsToVoiceEnd(words: WordTiming[], segments: Silence[]): number {
    let trimmed = 0;

    words.forEach((word, index) => {
        const next = words[index + 1];
        const segment = segments.find(
            item => word.start >= item.start - 0.15 && word.start < item.end,
        );

        if (!segment || word.end <= segment.end + 0.2) return;
        // Only when the next word really starts after the pause.
        if (next && next.start < word.end - 0.05) return;

        word.end = Math.max(word.start + MIN_WORD_SECONDS * 2, segment.end + 0.1);
        trimmed += 1;
    });

    return trimmed;
}

/**
 * Coverage check: stretches of voice that carry no transcribed word at all
 * (speech the recogniser skipped, e.g. a foreign-language line). Voice
 * segments of at least UNCOVERED_MIN_SECONDS whose words cover under a quarter
 * of them are merged (gaps up to UNCOVERED_MERGE_GAP_SECONDS) and padded, so
 * they can be re-transcribed separately. Music or laughter can match too: the
 * second request simply returns nothing for them.
 */
export type SpeechRange = { start: number; end: number };

const UNCOVERED_MIN_SECONDS = 0.35;
const UNCOVERED_MIN_TOTAL_SECONDS = 0.8;
const UNCOVERED_MERGE_GAP_SECONDS = 3;
const UNCOVERED_PAD_SECONDS = 0.4;
const UNCOVERED_MAX_RANGES = 6;

export function findUncoveredSpeech(
    words: WordTiming[],
    envelope: VoiceEnvelope,
    maxRanges = UNCOVERED_MAX_RANGES,
): SpeechRange[] {
    const audioEnd = envelope.level.length * envelope.hopSeconds;
    const uncovered = findVoiceSegments(envelope).filter(segment => {
        const duration = segment.end - segment.start;

        if (duration < UNCOVERED_MIN_SECONDS) return false;

        let covered = 0;

        for (const word of words) {
            const wordEnd = Math.min(word.end, word.start + naturalSeconds(word) * 1.5 + 0.2);
            const overlap = Math.min(wordEnd, segment.end) - Math.max(word.start, segment.start);

            if (overlap > 0) covered += overlap;
        }

        return covered < duration * 0.25;
    });

    const total = uncovered.reduce((sum, segment) => sum + segment.end - segment.start, 0);

    if (total < UNCOVERED_MIN_TOTAL_SECONDS) return [];

    const merged: SpeechRange[] = [];

    for (const segment of uncovered) {
        const last = merged[merged.length - 1];

        if (last && segment.start - last.end <= UNCOVERED_MERGE_GAP_SECONDS) {
            last.end = segment.end;
        } else {
            merged.push({ start: segment.start, end: segment.end });
        }
    }

    // More ranges than allowed: merge the two closest ones until they fit.
    while (merged.length > Math.max(1, maxRanges)) {
        let closest = 0;
        let smallestGap = Number.POSITIVE_INFINITY;

        for (let index = 0; index < merged.length - 1; index += 1) {
            const gap = merged[index + 1]!.start - merged[index]!.end;

            if (gap < smallestGap) {
                smallestGap = gap;
                closest = index;
            }
        }

        merged[closest]!.end = merged[closest + 1]!.end;
        merged.splice(closest + 1, 1);
    }

    return merged
        .map(range => ({
            start: Math.max(0, range.start - UNCOVERED_PAD_SECONDS),
            end: Math.min(audioEnd, range.end + UNCOVERED_PAD_SECONDS),
        }));
}

/**
 * Pure: the share (0–1) of [start, end] seconds where the voice is active, at
 * the same level that defines a voice segment. Used to check a claim about
 * speech ("a line is missing", "this line was never spoken") against the audio.
 */
export function voiceActivityShare(
    envelope: VoiceEnvelope,
    start: number,
    end: number,
): number {
    const { level, hopSeconds } = envelope;
    const first = Math.max(0, Math.floor(start / hopSeconds));
    const last = Math.min(level.length, Math.ceil(end / hopSeconds));

    if (last <= first) return 0;

    let active = 0;

    for (let index = first; index < last; index += 1) {
        if ((level[index] ?? 0) >= ACTIVE_LEVEL) active += 1;
    }

    return active / (last - first);
}

/** Pure: moves words at pauses to the voice (see the file comment). */
export function snapWordsToVoice(
    inputWords: WordTiming[],
    envelope: VoiceEnvelope,
): { words: WordTiming[]; summary: VoiceSnapSummary } {
    const words = inputWords.map(word => ({ ...word }));
    const original = inputWords.map(word => word.start);
    const silences = findSilences(envelope);
    let boundaries = 0;
    let movedToIsland = 0;

    for (const silence of silences) {
        // The punctuated word that ends the sentence/clause before the pause:
        // the one whose (stretched) end is nearest to the start of the silence.
        let boundary = -1;
        let boundaryDistance = Number.POSITIVE_INFINITY;
        for (let index = 0; index < words.length; index += 1) {
            const word = words[index];
            if (!word || !PUNCTUATION_END.test(word.text)) continue;
            if (word.start >= silence.start + 0.3) continue;
            const distance = word.end - silence.start;
            if (distance < -0.7 || distance > 1.3) continue;
            if (Math.abs(distance) < boundaryDistance) {
                boundary = index;
                boundaryDistance = Math.abs(distance);
            }
        }

        const before = words[boundary];
        if (!before) continue;

        // Never move a word further than MAX_SHIFT_SECONDS.
        const firstAfter = words[boundary + 1];
        if (
            !firstAfter ||
            silence.end - firstAfter.start > MAX_SHIFT_SECONDS ||
            firstAfter.start >= silence.end - 0.02 && firstAfter.start - silence.end > 0.6
        ) {
            continue;
        }

        boundaries += 1;

        // Short words ("в то,") stuck at the end of the loud part may really
        // be murmured inside the pause: move them to the weak island.
        const island = findWeakIsland(envelope, silence);
        let lastLoud = boundary;

        if (island) {
            let sum = 0;
            let index = boundary;

            while (index >= 1) {
                const word = words[index];
                if (!word || letters(word) > 3) break;
                const natural = naturalSeconds(word);
                if (sum + natural > (island.end - island.start) * 1.3 + 0.1) break;
                sum += natural;
                index -= 1;
            }

            const moved = words.slice(index + 1, boundary + 1);

            if (moved.length > 0 && index >= 0) {
                const span = Math.min(island.end - island.start, sum * 1.6);
                let cursor = island.start;

                moved.forEach(word => {
                    const share = span * naturalSeconds(word) / sum;
                    word.start = cursor;
                    word.end = cursor + share;
                    cursor += share;
                });
                lastLoud = index;
                movedToIsland += moved.length;

                // The loud word before them runs until the voice stops.
                const stayed = words[index];
                if (stayed) stayed.end = Math.max(stayed.end, silence.start);
            }
        }

        const loud = words[lastLoud];
        if (loud && lastLoud === boundary) {
            loud.end = Math.max(
                loud.start + MIN_WORD_SECONDS * 2,
                Math.min(loud.end, silence.start),
            );
        }

        // Voice onset: the first word after the pause, then the words that
        // would otherwise start before the previous one is finished.
        let lowerBound = silence.end;
        for (let index = boundary + 1; index < words.length; index += 1) {
            const word = words[index];
            if (!word) break;
            if (word.start >= lowerBound - 1e-6 && index > boundary + 1) break;

            word.start = Math.max(word.start, lowerBound);
            lowerBound = word.start + naturalSeconds(word);
        }
    }

    // Pauses without punctuation: re-assign stranded words to voice segments.
    const segments = findVoiceSegments(envelope);
    const relocated = alignWordsToVoiceSegments(
        words,
        segments,
        envelope.level.length * envelope.hopSeconds,
    );
    const trimmed = trimWordsToVoiceEnd(words, segments);

    // Words that share (almost) one start are a clump the recogniser could not
    // resolve: spread them over their natural durations up to the next word.
    let index = 0;
    while (index < words.length) {
        const first = words[index];
        if (!first) break;
        let end = index + 1;
        while (
            end < words.length &&
            (words[end]?.start ?? Infinity) - (words[end - 1]?.start ?? 0) < MIN_WORD_SECONDS
        ) {
            end += 1;
        }

        if (end - index >= 2) {
            const cluster = words.slice(index, end);
            const total = cluster.reduce((sum, word) => sum + naturalSeconds(word), 0);
            const next = words[end];
            const windowEnd = Math.min(
                next ? next.start : Number.POSITIVE_INFINITY,
                first.start + total * 1.4,
            );
            const span = Math.max(windowEnd - first.start, MIN_WORD_SECONDS * cluster.length);
            let cursor = first.start;

            cluster.forEach(word => {
                const share = span * naturalSeconds(word) / total;
                word.start = cursor;
                cursor += share;
            });
        }

        index = end;
    }

    // Keep the sequence valid: monotonic starts, ends not past the next start.
    for (let i = 0; i < words.length; i += 1) {
        const word = words[i];
        if (!word) continue;
        const previous = words[i - 1];
        if (previous && word.start < previous.start) word.start = previous.start;
    }
    for (let i = 0; i < words.length; i += 1) {
        const word = words[i];
        if (!word) continue;
        const next = words[i + 1];
        // A moved word keeps at least its natural duration (up to the next word).
        const wanted = word.start + naturalSeconds(word) * 0.8;
        if (word.end < wanted) {
            word.end = next ? Math.min(wanted, Math.max(next.start, word.start + MIN_WORD_SECONDS)) : wanted;
        }
        if (next && word.end > next.start) {
            word.end = Math.max(word.start + MIN_WORD_SECONDS, next.start);
        }
        if (word.end < word.start + MIN_WORD_SECONDS) {
            word.end = word.start + MIN_WORD_SECONDS;
        }
    }

    const movedWords = words.filter((word, i) =>
        Math.abs(word.start - (original[i] ?? word.start)) > 0.05,
    ).length;

    return {
        words,
        summary: { silences: silences.length, boundaries, movedWords, movedToIsland, relocated, trimmed },
    };
}
