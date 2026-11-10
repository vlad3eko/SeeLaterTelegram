import type { WordTiming } from '../types.js';

/**
 * Re-times one transcript (good text, unreliable timing) with the word
 * timings of another transcript of the same audio (reliable timing).
 *
 * Why: Gemini returns better text, but its word timestamps drift early as
 * the clip goes on and glue the first word of a phrase to the end of the
 * previous phrase (measured on a 40 s preview: 0.3–1.0 s early at the end,
 * "Благодарим" 25.95 s vs the voice at 26.6 s). Local Whisper timestamps match
 * the voice within ~0.1 s. Since the captions run a fixed lead ahead of the
 * word timings, drifting timings made the lead grow to 2–3 s.
 *
 * The two word sequences are aligned with a weighted LCS on normalised tokens
 * (fuzzy: "Михайль" ↔ "Михай", "Гергиев" ↔ "Георгиу"). Matched words take the
 * reference start/end; unmatched words are placed proportionally between the
 * nearest matched neighbours, so the result stays monotonic.
 */
export type RetimeSummary = {
    words: number;
    matched: number;
    /** Mean |text start − reference start| over matched words, in ms. */
    meanShiftMs: number;
    maxShiftMs: number;
};

function normalizeToken(value: string): string {
    return value
        .toLocaleUpperCase('ru-RU')
        .replace(/Ё/gu, 'Е')
        .replace(/[^\p{L}\p{N}]+/gu, '');
}

function levenshtein(a: string, b: string): number {
    if (a === b) return 0;
    const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
    for (let i = 1; i <= a.length; i += 1) {
        let diagonal = previous[0] ?? 0;
        previous[0] = i;
        for (let j = 1; j <= b.length; j += 1) {
            const above = previous[j] ?? 0;
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            previous[j] = Math.min(
                above + 1,
                (previous[j - 1] ?? 0) + 1,
                diagonal + cost,
            );
            diagonal = above;
        }
    }
    return previous[b.length] ?? Math.max(a.length, b.length);
}

function similarity(a: string, b: string): number {
    if (!a || !b) return 0;
    return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
}

const MIN_SIMILARITY = 0.5;
const SENTENCE_END = /[.!?…][»”’"')\]]*$/u;
/** Pairs further apart than this in time are never matched. */
const MAX_TIME_DISTANCE_S = 3;

export function retimeWordsByReference(
    textWords: WordTiming[],
    referenceWords: WordTiming[],
): { words: WordTiming[]; summary: RetimeSummary } {
    const n = textWords.length;
    const m = referenceWords.length;
    const textTokens = textWords.map(word => normalizeToken(word.text));
    const referenceTokens = referenceWords.map(word => normalizeToken(word.text));

    // Weighted LCS: score[i][j] = best alignment of text[0..i) with ref[0..j).
    const score: Float64Array[] = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
    const pairScore = (i: number, j: number): number => {
        const text = textWords[i];
        const reference = referenceWords[j];
        if (!text || !reference) return 0;
        if (Math.abs(text.start - reference.start) > MAX_TIME_DISTANCE_S) return 0;
        const s = similarity(textTokens[i] ?? '', referenceTokens[j] ?? '');
        return s >= MIN_SIMILARITY ? s : 0;
    };

    for (let i = 1; i <= n; i += 1) {
        const row = score[i]!;
        const previousRow = score[i - 1]!;
        for (let j = 1; j <= m; j += 1) {
            const match = pairScore(i - 1, j - 1);
            row[j] = Math.max(
                previousRow[j]!,
                row[j - 1]!,
                match > 0 ? previousRow[j - 1]! + match : 0,
            );
        }
    }

    // Backtrack the matched pairs.
    const matchOf = new Array<number>(n).fill(-1);
    for (let i = n, j = m; i > 0 && j > 0;) {
        const current = score[i]![j]!;
        const match = pairScore(i - 1, j - 1);
        if (match > 0 && Math.abs(current - (score[i - 1]![j - 1]! + match)) < 1e-9) {
            matchOf[i - 1] = j - 1;
            i -= 1;
            j -= 1;
        } else if (Math.abs(current - score[i - 1]![j]!) < 1e-9) {
            i -= 1;
        } else {
            j -= 1;
        }
    }

    const result: WordTiming[] = textWords.map(word => ({ ...word }));
    let shiftSum = 0;
    let maxShift = 0;
    let matched = 0;

    matchOf.forEach((j, i) => {
        const reference = j >= 0 ? referenceWords[j] : undefined;
        const word = result[i];
        if (!reference || !word) return;
        const shift = Math.abs(word.start - reference.start) * 1000;
        shiftSum += shift;
        maxShift = Math.max(maxShift, shift);
        matched += 1;
        word.start = reference.start;
        word.end = Math.max(reference.end, reference.start + 0.05);
    });

    // Unmatched words: distribute between matched neighbours (or shift with
    // the nearest matched word at the edges).
    let index = 0;
    while (index < n) {
        if (matchOf[index]! >= 0) {
            index += 1;
            continue;
        }
        const runStart = index;
        while (index < n && matchOf[index]! < 0) index += 1;
        const runEnd = index; // exclusive

        const before = runStart > 0 ? result[runStart - 1] : undefined;
        const after = runEnd < n ? result[runEnd] : undefined;
        const original = textWords.slice(runStart, runEnd);
        const firstOriginal = original[0];
        const lastOriginal = original[original.length - 1];
        if (!firstOriginal || !lastOriginal) continue;

        if (before && after) {
            const from = before.end;
            const to = Math.max(from, after.start);
            const lengths = original.map(word => Math.max(1, normalizeToken(word.text).length));
            const total = lengths.reduce((sum, value) => sum + value, 0);

            // A hole much longer than the words need (laughter, music, a long
            // pause between sentences): spreading the words over it would put
            // them into the sound effect. A run that starts a sentence sits
            // right before the next matched word; one that ends a sentence
            // sits right after the previous one.
            const natural = lengths.map(length => Math.min(0.4, 0.045 * length + 0.06));
            const naturalTotal = natural.reduce((sum, value) => sum + value, 0);

            if (to - from > naturalTotal * 1.5 + 0.8) {
                const previousText = textWords[runStart - 1]?.text ?? '';
                const startsSentence = SENTENCE_END.test(previousText.trim());
                const endsSentence = SENTENCE_END.test(lastOriginal.text.trim());

                if (startsSentence || endsSentence) {
                    let cursor = startsSentence ? to - naturalTotal : from;
                    original.forEach((_, offset) => {
                        const word = result[runStart + offset];
                        if (!word) return;
                        word.start = cursor;
                        word.end = cursor + natural[offset]!;
                        cursor += natural[offset]!;
                    });
                    continue;
                }
            }

            let cursor = from;
            original.forEach((_, offset) => {
                const word = result[runStart + offset];
                if (!word) return;
                const span = (to - from) * (lengths[offset]! / total);
                word.start = cursor;
                word.end = Math.max(cursor + 0.05, cursor + span);
                cursor += span;
            });
        } else {
            // Edge run: keep Gemini spacing, shifted by the neighbour's correction.
            const anchorText = before ? textWords[runStart - 1] : textWords[runEnd];
            const anchorResult = before ?? after;
            const delta = anchorText && anchorResult ? anchorResult.start - anchorText.start : 0;
            original.forEach((source, offset) => {
                const word = result[runStart + offset];
                if (!word) return;
                word.start = Math.max(0, source.start + delta);
                word.end = Math.max(word.start + 0.05, source.end + delta);
            });
        }
    }

    // Keep the sequence monotonic and valid.
    for (let i = 1; i < result.length; i += 1) {
        const previous = result[i - 1]!;
        const word = result[i]!;
        if (word.start < previous.start) word.start = previous.start;
        if (word.end <= word.start) word.end = word.start + 0.05;
    }

    return {
        words: result,
        summary: {
            words: n,
            matched,
            meanShiftMs: matched > 0 ? Math.round(shiftSum / matched) : 0,
            maxShiftMs: Math.round(maxShift),
        },
    };
}
