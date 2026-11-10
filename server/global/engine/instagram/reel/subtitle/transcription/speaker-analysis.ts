import { spawn } from 'node:child_process';

import type { WordTiming } from '../types.js';

/**
 * Who is speaking: speaker labels for every word.
 *
 * Two sources are combined (both live inside the subtitle module):
 *  1. Labels from Gemini (`word.speaker`, requested with diarization_mode).
 *  2. A voice analysis of the audio itself: pitch (F0) and timbre (MFCC-like
 *     cepstrum) of each utterance. It confirms or overrides Gemini where a
 *     pause separates two chunks, and works alone when Gemini sends no labels
 *     (Whisper provider, or diarization rejected by the API).
 *
 * Result: `word.speaker = 'S1' | 'S2' | …`. The block builder uses it to
 *  - cut a block when the speaker changes (even without a pause);
 *  - keep one sentence together across a breath pause of the same speaker.
 *
 * The analysis is deliberately conservative: when it is not sure it keeps the
 * Gemini label, and when there is no information at all it leaves
 * `speaker` undefined (the block builder then falls back to pauses only).
 */

const SAMPLE_RATE = 16_000;
/** Longest audio the speaker analysis reads into memory. */
const MAX_ANALYSIS_SECONDS = 1800;
const FRAME = 512; // 32 ms
const HOP = 256; // 16 ms
const MEL_BANDS = 20;
const CEPSTRA = 10; // c1..c10

/** Words closer than this belong to one utterance chunk (s). */
const CHUNK_GAP_SECONDS = 0.35;
/** Voice distance below which two chunks are the same voice. */
const SAME_VOICE_DISTANCE = 1.0;
/** Between SAME*0.7 and SAME*1.3 the Gemini label decides. */
const UNSURE_BAND = 0.3;
/** Chunks with less voiced audio than this carry no usable voice print (s). */
const MIN_VOICED_SECONDS = 0.12;
const MAX_SPEAKERS = 8;

export type VoicePrint = {
    /** Median F0 in Hz; 0 when unvoiced. */
    f0: number;
    /** Mean cepstrum c1..cN (level-independent timbre). */
    cepstrum: number[];
    voicedSeconds: number;
};

export type SpeakerSummary = {
    words: number;
    speakers: number;
    changes: number;
    source: 'gemini+voice' | 'voice' | 'gemini' | 'none';
    /** Gemini label overridden by the voice analysis. */
    overridden: number;
};

// ---------------------------------------------------------------- audio ---

export async function readMonoPcm(
    inputPath: string,
    ffmpegPath = 'ffmpeg',
    timeoutMs = 120_000,
): Promise<Float32Array> {
    const chunks: Buffer[] = [];

    await new Promise<void>((resolve, reject) => {
        const child = spawn(ffmpegPath, [
            '-hide_banner', '-nostdin', '-loglevel', 'error',
            '-i', inputPath,
            '-vn', '-ac', '1', '-ar', String(SAMPLE_RATE),
            '-f', 's16le', '-',
        ], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
        const timer = setTimeout(() => {
            child.kill();
            reject(new Error('Audio extraction for speaker analysis timed out.'));
        }, timeoutMs);
        let stderr = '';

        let bytes = 0;

        child.stdout.on('data', (chunk: Buffer) => {
            bytes += chunk.length;
            // Mono 16-bit audio: a runaway input must not fill the memory.
            if (bytes > SAMPLE_RATE * 2 * MAX_ANALYSIS_SECONDS) {
                child.kill();
                clearTimeout(timer);
                reject(new Error(`Audio is longer than ${MAX_ANALYSIS_SECONDS} s; speaker analysis skipped.`));
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
    const samples = new Float32Array(pcm.length);

    for (let index = 0; index < pcm.length; index += 1) {
        samples[index] = (pcm[index] ?? 0) / 32768;
    }

    return samples;
}

// ------------------------------------------------------------------ DSP ---

const hann = new Float32Array(FRAME).map(
    (_, index) => 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (FRAME - 1)),
);

function fftMagnitudes(frame: Float32Array): Float32Array {
    const n = FRAME;
    const re = new Float64Array(n);
    const im = new Float64Array(n);

    for (let index = 0; index < n; index += 1) {
        re[index] = (frame[index] ?? 0) * (hann[index] ?? 0);
    }

    // bit reversal
    for (let i = 1, j = 0; i < n; i += 1) {
        let bit = n >> 1;
        for (; j & bit; bit >>= 1) j ^= bit;
        j ^= bit;
        if (i < j) {
            const tr = re[i]!; re[i] = re[j]!; re[j] = tr;
            const ti = im[i]!; im[i] = im[j]!; im[j] = ti;
        }
    }

    for (let len = 2; len <= n; len <<= 1) {
        const angle = (-2 * Math.PI) / len;
        const wr = Math.cos(angle);
        const wi = Math.sin(angle);

        for (let i = 0; i < n; i += len) {
            let cr = 1;
            let ci = 0;

            for (let k = 0; k < len / 2; k += 1) {
                const a = i + k;
                const b = i + k + len / 2;
                const xr = re[b]! * cr - im[b]! * ci;
                const xi = re[b]! * ci + im[b]! * cr;

                re[b] = re[a]! - xr;
                im[b] = im[a]! - xi;
                re[a] = re[a]! + xr;
                im[a] = im[a]! + xi;

                const nr = cr * wr - ci * wi;
                ci = cr * wi + ci * wr;
                cr = nr;
            }
        }
    }

    const half = n / 2;
    const magnitude = new Float32Array(half);

    for (let index = 0; index < half; index += 1) {
        magnitude[index] = Math.hypot(re[index]!, im[index]!);
    }

    return magnitude;
}

const melToHz = (mel: number): number => 700 * (10 ** (mel / 2595) - 1);
const hzToMel = (hz: number): number => 2595 * Math.log10(1 + hz / 700);

/** Triangular mel filters over 100 Hz … 7 kHz. */
const melFilters: Array<{ from: number; weights: number[] }> = (() => {
    const lowMel = hzToMel(100);
    const highMel = hzToMel(7000);
    const points = Array.from({ length: MEL_BANDS + 2 }, (_, index) =>
        melToHz(lowMel + ((highMel - lowMel) * index) / (MEL_BANDS + 1)),
    );
    const binHz = SAMPLE_RATE / FRAME;
    const filters: Array<{ from: number; weights: number[] }> = [];

    for (let band = 0; band < MEL_BANDS; band += 1) {
        const left = points[band]!;
        const centre = points[band + 1]!;
        const right = points[band + 2]!;
        const from = Math.floor(left / binHz);
        const to = Math.ceil(right / binHz);
        const weights: number[] = [];

        for (let bin = from; bin <= to; bin += 1) {
            const hz = bin * binHz;
            const weight = hz < centre
                ? (hz - left) / (centre - left)
                : (right - hz) / (right - centre);
            weights.push(Math.max(0, weight));
        }

        filters.push({ from, weights });
    }

    return filters;
})();

const dct: number[][] = Array.from({ length: CEPSTRA }, (_, k) =>
    Array.from({ length: MEL_BANDS }, (_, band) =>
        Math.cos((Math.PI * (k + 1) * (band + 0.5)) / MEL_BANDS),
    ),
);

/** Normalised autocorrelation pitch of one frame; 0 when unvoiced. */
function estimatePitch(frame: Float32Array): number {
    const minLag = Math.floor(SAMPLE_RATE / 400);
    const maxLag = Math.floor(SAMPLE_RATE / 70);
    let energy = 0;

    for (let index = 0; index < FRAME; index += 1) {
        energy += (frame[index] ?? 0) ** 2;
    }

    if (energy < 1e-6) return 0;

    let bestLag = 0;
    let best = 0;

    for (let lag = minLag; lag <= maxLag; lag += 1) {
        let sum = 0;
        let tail = 0;

        for (let index = 0; index + lag < FRAME; index += 1) {
            const a = frame[index] ?? 0;
            const b = frame[index + lag] ?? 0;
            sum += a * b;
            tail += b * b;
        }

        const value = sum / Math.sqrt(energy * (tail || 1));

        if (value > best) {
            best = value;
            bestLag = lag;
        }
    }

    return best >= 0.45 && bestLag > 0 ? SAMPLE_RATE / bestLag : 0;
}

const median = (values: number[]): number => {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)] ?? 0;
};

/** Voice print of [start, end] seconds: only loud, voiced frames count. */
export function computeVoicePrint(
    samples: Float32Array,
    start: number,
    end: number,
): VoicePrint {
    const from = Math.max(0, Math.floor(start * SAMPLE_RATE));
    const to = Math.min(samples.length, Math.floor(end * SAMPLE_RATE));
    const frames: Array<{ rms: number; f0: number; cepstrum: number[] }> = [];

    for (let offset = from; offset + FRAME <= to; offset += HOP) {
        const frame = samples.subarray(offset, offset + FRAME);
        let energy = 0;

        for (let index = 0; index < FRAME; index += 1) energy += frame[index]! ** 2;

        const rms = Math.sqrt(energy / FRAME);
        const f0 = estimatePitch(frame);

        if (f0 === 0) continue;

        const magnitude = fftMagnitudes(frame);
        const logMel = melFilters.map(({ from: first, weights }) => {
            let sum = 0;
            weights.forEach((weight, index) => {
                sum += weight * (magnitude[first + index] ?? 0) ** 2;
            });
            return Math.log(sum + 1e-10);
        });

        frames.push({
            rms,
            f0,
            cepstrum: dct.map(row =>
                row.reduce((total, coefficient, band) => total + coefficient * (logMel[band] ?? 0), 0) / MEL_BANDS,
            ),
        });
    }

    if (frames.length === 0) {
        return { f0: 0, cepstrum: new Array<number>(CEPSTRA).fill(0), voicedSeconds: 0 };
    }

    // The loudest 70 % of voiced frames (drops trailing breath / noise).
    const threshold = median(frames.map(frame => frame.rms)) * 0.6;
    const kept = frames.filter(frame => frame.rms >= threshold);
    const used = kept.length > 0 ? kept : frames;

    return {
        f0: median(used.map(frame => frame.f0)),
        cepstrum: Array.from({ length: CEPSTRA }, (_, k) =>
            used.reduce((total, frame) => total + (frame.cepstrum[k] ?? 0), 0) / used.length,
        ),
        voicedSeconds: used.length * (HOP / SAMPLE_RATE),
    };
}

/**
 * Distance between two voice prints: ≈ 1 is the border between "same voice"
 * and "other voice". Pitch counts in semitones, timbre as cepstral distance.
 */
export function voiceDistance(a: VoicePrint, b: VoicePrint): number {
    const timbre = Math.sqrt(
        a.cepstrum.reduce(
            (total, value, index) => total + (value - (b.cepstrum[index] ?? 0)) ** 2,
            0,
        ),
    ) / 2.2;

    if (a.f0 <= 0 || b.f0 <= 0) return timbre;

    const semitones = Math.abs(12 * Math.log2(a.f0 / b.f0));
    const pitch = semitones / 4;

    return Math.sqrt(0.6 * pitch * pitch + 0.4 * timbre * timbre) * 1.4;
}

function mergePrints(a: VoicePrint, b: VoicePrint): VoicePrint {
    const total = a.voicedSeconds + b.voicedSeconds;

    if (total <= 0) return a;

    const wa = a.voicedSeconds / total;
    const wb = b.voicedSeconds / total;

    return {
        f0: a.f0 > 0 && b.f0 > 0 ? a.f0 * wa + b.f0 * wb : Math.max(a.f0, b.f0),
        cepstrum: a.cepstrum.map((value, index) => value * wa + (b.cepstrum[index] ?? 0) * wb),
        voicedSeconds: total,
    };
}

// ------------------------------------------------------------- decision ---

type Chunk = { first: number; last: number; print: VoicePrint };

function buildChunks(words: WordTiming[], samples: Float32Array): Chunk[] {
    const chunks: Chunk[] = [];
    let first = 0;

    for (let index = 1; index <= words.length; index += 1) {
        const previous = words[index - 1]!;
        const next = words[index];

        if (next && next.start - previous.end <= CHUNK_GAP_SECONDS) continue;

        chunks.push({
            first,
            last: index - 1,
            print: computeVoicePrint(samples, words[first]!.start, previous.end),
        });
        first = index;
    }

    return chunks;
}

/**
 * Labels every word with a speaker. Pure function of the words and the audio
 * samples, so it can be tested without ffmpeg.
 */
export function assignSpeakers(
    inputWords: WordTiming[],
    samples: Float32Array | undefined,
): { words: WordTiming[]; summary: SpeakerSummary } {
    const words = inputWords.map(word => ({ ...word }));
    const hasGemini = words.some(word => word.speaker !== undefined);
    const chunks = samples ? buildChunks(words, samples) : [];
    const usable = (chunk: Chunk | undefined): chunk is Chunk =>
        chunk !== undefined && chunk.print.voicedSeconds >= MIN_VOICED_SECONDS;

    // 1. Change points between consecutive words (change[i]: words[i-1] ≠ words[i]).
    const change: boolean[] = words.map(() => false);
    let overridden = 0;

    for (let index = 1; index < words.length; index += 1) {
        const a = words[index - 1]!.speaker;
        const b = words[index]!.speaker;
        change[index] = a !== undefined && b !== undefined && a !== b;
    }

    for (let c = 1; c < chunks.length; c += 1) {
        const left = chunks[c - 1];
        const right = chunks[c];
        const boundary = right!.first;

        if (!usable(left) || !usable(right)) continue;

        const distance = voiceDistance(left.print, right.print);
        const geminiSays = change[boundary]!;
        let decision: boolean;

        if (!hasGemini) {
            decision = distance > SAME_VOICE_DISTANCE;
        } else if (distance < SAME_VOICE_DISTANCE * (1 - UNSURE_BAND)) {
            decision = false;
        } else if (distance > SAME_VOICE_DISTANCE * (1 + UNSURE_BAND)) {
            decision = true;
        } else {
            decision = geminiSays;
        }

        if (hasGemini && decision !== geminiSays) overridden += 1;
        change[boundary] = decision;
    }

    // 2. Segments between change points → global speaker ids by voice.
    const segments: Array<{ first: number; last: number }> = [];
    let first = 0;

    for (let index = 1; index <= words.length; index += 1) {
        if (index === words.length || change[index]) {
            segments.push({ first, last: index - 1 });
            first = index;
        }
    }

    const speakers: VoicePrint[] = [];
    const speakerOfSegment: number[] = [];
    let previousSpeaker = -1;

    for (const segment of segments) {
        const print = samples
            ? computeVoicePrint(samples, words[segment.first]!.start, words[segment.last]!.end)
            : undefined;
        let chosen = -1;

        if (print && print.voicedSeconds >= MIN_VOICED_SECONDS) {
            let best = SAME_VOICE_DISTANCE;

            speakers.forEach((speaker, id) => {
                const distance = voiceDistance(speaker, print);
                // A segment never joins the speaker it was just separated from.
                if (id !== previousSpeaker && distance < best) {
                    best = distance;
                    chosen = id;
                }
            });
        }

        if (chosen === -1) {
            if (segments.length === 1 || speakers.length === 0 || speakers.length < MAX_SPEAKERS) {
                speakers.push(print ?? { f0: 0, cepstrum: new Array<number>(CEPSTRA).fill(0), voicedSeconds: 0 });
                chosen = speakers.length - 1;
            } else {
                chosen = previousSpeaker >= 0 ? previousSpeaker : 0;
            }
        } else if (print) {
            speakers[chosen] = mergePrints(speakers[chosen]!, print);
        }

        speakerOfSegment.push(chosen);
        previousSpeaker = chosen;
    }

    segments.forEach((segment, index) => {
        const label = `S${(speakerOfSegment[index] ?? 0) + 1}`;
        for (let word = segment.first; word <= segment.last; word += 1) {
            words[word]!.speaker = label;
        }
    });

    const source: SpeakerSummary['source'] =
        hasGemini && samples ? 'gemini+voice' : hasGemini ? 'gemini' : samples ? 'voice' : 'none';

    return {
        words,
        summary: {
            words: words.length,
            speakers: new Set(speakerOfSegment).size,
            changes: change.filter(Boolean).length,
            source,
            overridden,
        },
    };
}

export async function analyseSpeakers(
    inputPath: string,
    words: WordTiming[],
    ffmpegPath = 'ffmpeg',
): Promise<{ words: WordTiming[]; summary: SpeakerSummary }> {
    const samples = await readMonoPcm(inputPath, ffmpegPath);

    return assignSpeakers(words, samples);
}
