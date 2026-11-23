import type { SubtitleConfig, SubtitleWord } from '../types.js';

/**
 * Row flow: when each caption row first becomes visible.
 *
 * A row is shown as a whole. Every word of a row gets the same earliest
 * display time: `entryLeadMs` before the first word of the row is spoken.
 * The row then lights up as one smooth left-to-right sweep (letters at
 * `entryLetterStepMs`, the mirror of the exit wave), instead of the former
 * word-pause-word beat that followed the transcription timestamps.
 *
 * The result is written to `word.displayStart` (seconds). Collision safety and
 * the global word-order gap are still applied on top by the ASS generator.
 */
export type PhraseFlowSummary = {
    words: number;
    /** Number of rows. */
    runs: number;
    /** Mean (spoken start − displayed start) in ms; positive = ahead of voice. */
    meanLeadMs: number;
};

/**
 * @param blocks Caption blocks in reading order; each block is its rows
 *               (upper row first), each row its words.
 */
export function assignPhraseFlow(
    blocks: SubtitleWord[][][],
    config: SubtitleConfig,
): PhraseFlowSummary {
    const animation = config.animation;
    const wordsMode = animation.entryMode === 'words';
    const rowLeadMs = Math.max(0, animation.entryLeadMs);

    let wordCount = 0;
    let rowCount = 0;
    let leadSum = 0;
    let previousOnsetMs = Number.NEGATIVE_INFINITY;

    for (const block of blocks) {
        if (wordsMode) {
            // Words follow the speech one by one. The lead grows from
            // entryLeadStartMs (first word of the sentence) to entryLeadEndMs
            // (its last word), as measured on the reference.
            const words = block.flat();
            const count = words.length;
            words.forEach((word, index) => {
                const t = count > 1 ? index / (count - 1) : 0;
                const leadMs = Math.max(
                    0,
                    animation.entryLeadStartMs +
                        (animation.entryLeadEndMs - animation.entryLeadStartMs) * t,
                );
                const onsetMs = Math.max(
                    0,
                    word.start * 1000 - leadMs,
                    previousOnsetMs,
                );
                word.displayStart = onsetMs / 1000;
                leadSum += word.start * 1000 - onsetMs;
                wordCount += 1;
                previousOnsetMs = onsetMs;
            });
            rowCount += block.length;
            continue;
        }

        for (const row of block) {
            if (row.length === 0) continue;

            const firstStartMs = Math.min(...row.map(word => word.start * 1000));
            // Rows never appear out of order.
            const onsetMs = Math.max(0, firstStartMs - rowLeadMs, previousOnsetMs);

            for (const word of row) {
                word.displayStart = onsetMs / 1000;
                leadSum += word.start * 1000 - onsetMs;
                wordCount += 1;
            }

            previousOnsetMs = onsetMs;
            rowCount += 1;
        }
    }

    return {
        words: wordCount,
        runs: rowCount,
        meanLeadMs: wordCount > 0 ? Math.round(leadSum / wordCount) : 0,
    };
}

/** Per-glyph build-up step: ~0 in words mode (a word appears as a whole). */
export function getEntryLetterStepMs(config: SubtitleConfig): number {
    const a = config.animation;
    return Math.max(
        0,
        a.entryMode === 'words' ? a.entryWordLetterStepMs : a.entryLetterStepMs,
    );
}

/** First time (ms) a word may appear: the row schedule, or its spoken start. */
export function getWordBaseEntryMs(word: SubtitleWord): number {
    return (word.displayStart ?? word.start) * 1000;
}

/** A word longer than this is a stretched timestamp (music, a held note), not speech. */
const DEFAULT_MAX_WORD_HOLD_MS = 1200;

/** Spoken end of a word, ms, with a stretched timestamp cut to maxWordHoldMs. */
export function getWordSpokenEndMs(word: SubtitleWord, maxWordHoldMs = DEFAULT_MAX_WORD_HOLD_MS): number {
    return Math.min(word.end, word.start + maxWordHoldMs / 1000) * 1000;
}

/**
 * Display-relative end of a word: it stays at least as long as it is spoken,
 * counted from the moment it was shown (so the lead does not shorten it).
 */
export function getWordDisplayEndMs(word: SubtitleWord, maxWordHoldMs = DEFAULT_MAX_WORD_HOLD_MS): number {
    return getWordBaseEntryMs(word) + Math.max(0, getWordSpokenEndMs(word, maxWordHoldMs) - word.start * 1000);
}

/**
 * When each phrase starts to leave (ms), as on the owner's reference (23.11):
 *  - the next phrase starts within holdUntilNextMaxGapMs after the speech: the
 *    phrase stays and crossfades into it (exitTriggerLeadMs before it appears);
 *  - a longer pause: it leaves exitNoNextDelayMs after its last word;
 *  - a hard cut comes after the speech and before that moment: it is gone by the cut;
 *  - never before its last word has been readable for phraseMinHoldMs.
 *
 * @param blocks words of each phrase, in order (displayStart already assigned)
 * @param cutsSeconds hard cuts of the clip, seconds
 */
export function planPhraseExits(
    blocks: SubtitleWord[][],
    cutsSeconds: number[],
    animation: SubtitleConfig['animation'],
): number[] {
    const maxHold = animation.maxWordHoldMs ?? DEFAULT_MAX_WORD_HOLD_MS;
    const cutsMs = cutsSeconds.map(seconds => seconds * 1000).sort((a, b) => a - b);
    const exitSpanMs = animation.exitPhaseADurationMs + animation.exitPhaseBDurationMs;

    return blocks.map((words, index) => {
        if (words.length === 0) return 0;

        const spokenEndMs = Math.max(...words.map(word => getWordSpokenEndMs(word, maxHold)));
        const holdMs = Math.max(...words.map(word => getWordBaseEntryMs(word))) + animation.phraseMinHoldMs;
        const next = blocks[index + 1];
        const nextStartMs = next?.length ? Math.min(...next.map(getWordBaseEntryMs)) : undefined;

        let exitMs = nextStartMs !== undefined && nextStartMs - spokenEndMs <= animation.holdUntilNextMaxGapMs
            ? nextStartMs - animation.exitTriggerLeadMs
            : spokenEndMs + animation.exitNoNextDelayMs;

        // A cut after the speech (a frame or two after the last word) ends the phrase with the shot.
        const cut = cutsMs.find(time => time > spokenEndMs + 40 && time < exitMs + exitSpanMs);
        if (cut !== undefined) {
            // …but not before the last word has been said.
            exitMs = Math.max(spokenEndMs, Math.min(exitMs, cut - exitSpanMs - animation.exitBeforeCutMs));
        }

        return Math.max(exitMs, holdMs);
    });
}
