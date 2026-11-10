
import type {
    KeyPhrase,
    NeonStyle,
    SubtitleBlock,
    SubtitleConfig,
    SubtitleWord,
    WordTiming,
} from '../types.js';

const HARD_PUNCTUATION = /[.!?…;:][»”’"')\]]*$/u;

const CONNECTORS = new Set([
    'И', 'А', 'НО', 'НЕ', 'В', 'ВО', 'НА', 'С', 'СО',
    'ПО', 'К', 'КО', 'У', 'О', 'ОБ', 'ОТ', 'ИЗ',
    'ЗА', 'ПОД', 'НАД', 'ДО', 'ДЛЯ', 'ПРИ', 'ЧЕРЕЗ',
    'ПРО', 'БЕЗ',
]);

const MIN_BLOCK_FONT_SCALE = 0.68;

const MIN_BLOCK_WORDS = 2;
const MIN_BLOCK_DURATION_SECONDS = 0.7;
const MAX_MERGE_GAP_SECONDS = 0.4;

export function normalizeSubtitleToken(value: string): string {
    return value
        .toLocaleUpperCase('ru-RU')
        .replace(/[^\p{L}\p{N}Ё]+/gu, '');
}

function lengthOf(words: WordTiming[]): number {
    return words.reduce(
        (sum, word, index) =>
            sum + word.text.length + (index ? 1 : 0),
        0,
    );
}

function blockDuration(words: WordTiming[]): number {
    const first = words[0];
    const last = words[words.length - 1];

    if (!first || !last) {
        return 0;
    }

    return Math.max(0, last.end - first.start);
}

function findBestSplit(
    words: WordTiming[],
    maxChars: number,
): number {
    let bestSplit = -1;
    let bestScore = Number.POSITIVE_INFINITY;

    for (let split = 1; split < words.length; split += 1) {
        const first = words.slice(0, split);
        const second = words.slice(split);

        const firstLength = lengthOf(first);
        const secondLength = lengthOf(second);

        const firstLastWord = first[first.length - 1];
        const secondFirstWord = second[0];

        if (!firstLastWord || !secondFirstWord) {
            continue;
        }

        const firstLast = normalizeSubtitleToken(firstLastWord.text);
        const secondFirst = normalizeSubtitleToken(secondFirstWord.text);

        // Допускаем превышение maxChars:
        // размер шрифта будет уменьшен пропорционально.
        const overflow =
            Math.max(0, firstLength - maxChars) +
            Math.max(0, secondLength - maxChars);

        const score =
            Math.abs(firstLength - secondLength) +
            overflow * 8 +
            (CONNECTORS.has(firstLast) ? 100 : 0) +
            (CONNECTORS.has(secondFirst) ? 8 : 0) +
            (first.length === 1 || second.length === 1 ? 12 : 0) -
            // The reference breaks rows at a comma / clause end, or where the
            // speaker takes a short breath.
            (/[,;:.!?…—-]$/.test(firstLastWord.text.trim()) ? 14 : 0) -
            // A real pause is the strongest place for a row break.
            (secondFirstWord.start - firstLastWord.end >= 0.8
                ? 30
                : secondFirstWord.start - firstLastWord.end >= 0.25
                    ? 8
                    : 0);

        if (score < bestScore) {
            bestScore = score;
            bestSplit = split;
        }
    }

    return bestSplit;
}

function canFitIntoLines(
    words: WordTiming[],
    maxChars: number,
    maxLines: number,
    maxScaleFactor = 1,
): boolean {
    if (words.length === 0) {
        return true;
    }

    const bestSplit = lengthOf(words) <= maxChars
        ? -1
        : findBestSplit(words, maxChars);

    if (bestSplit === -1) {
        const singleLineScale =
            maxChars / (lengthOf(words) * maxScaleFactor);

        return singleLineScale >= MIN_BLOCK_FONT_SCALE;
    }

    if (maxLines < 2) {
        return false;
    }

    const firstLength = lengthOf(words.slice(0, bestSplit));
    const secondLength = lengthOf(words.slice(bestSplit));

    const fontScale =
        maxChars /
        (Math.max(firstLength, secondLength) * maxScaleFactor);

    return fontScale >= MIN_BLOCK_FONT_SCALE;
}

function isShortBlock(words: WordTiming[]): boolean {
    if (words.length === 0) {
        return false;
    }

    const minimumDuration = Math.max(
        MIN_BLOCK_DURATION_SECONDS,
        words.length * 0.25,
    );

    return (
        words.length < MIN_BLOCK_WORDS ||
        blockDuration(words) < minimumDuration
    );
}

/** Both words have a speaker and it differs. */
function speakerChanged(left: WordTiming, right: WordTiming): boolean {
    return (
        left.speaker !== undefined &&
        right.speaker !== undefined &&
        left.speaker !== right.speaker
    );
}

/**
 * Does `next` start a new phrase after `previous` (pause, sentence end or a
 * different speaker)? The same speaker pausing for a breath inside an
 * unfinished sentence ("...в то, | что там творится") does not.
 */
function startsNewPhrase(
    previous: WordTiming,
    next: WordTiming,
    config: SubtitleConfig,
): boolean {
    if (HARD_PUNCTUATION.test(previous.text)) {
        return true;
    }

    if (config.layout.splitOnSpeakerChange && speakerChanged(previous, next)) {
        return true;
    }

    const gap = next.start - previous.end;

    if (gap <= config.layout.splitOnPauseSeconds) {
        return false;
    }

    const sameSpeaker =
        previous.speaker !== undefined &&
        previous.speaker === next.speaker;

    return !(sameSpeaker && gap <= config.layout.sameSpeakerContinueSeconds);
}

function canMergeBlocks(
    left: WordTiming[],
    right: WordTiming[],
    config: SubtitleConfig,
): boolean {
    const leftLast = left[left.length - 1];
    const rightFirst = right[0];

    if (!leftLast || !rightFirst) {
        return false;
    }

    const gap = rightFirst.start - leftLast.end;

    if (
        gap < -0.05 ||
        gap > MAX_MERGE_GAP_SECONDS
    ) {
        return false;
    }

    // Never merge phrases of different speakers.
    if (config.layout.splitOnSpeakerChange && speakerChanged(leftLast, rightFirst)) {
        return false;
    }

    // A finished sentence stays on its own row(s): "ДЕРЖИСЬ." must not be
    // glued to the beginning of the next sentence. Short sentences are paired
    // into two rows later (pairNeighbourPhrases).
    if (HARD_PUNCTUATION.test(leftLast.text)) {
        return false;
    }

    const combined = [...left, ...right];

    if (
        combined.length >
        config.layout.maxWordsPerBlock
    ) {
        return false;
    }

    if (
        blockDuration(combined) >
        config.layout.maxBlockDurationSeconds
    ) {
        return false;
    }

    return canFitIntoLines(
        combined,
        config.typography.maxCharsPerLine,
        config.typography.maxLines,
        Math.max(
            1,
            config.animation.blockScaleEndPercent / 100,
        ),
    );
}

/**
 * Merge short phrases with the nearest suitable neighbor.
 *
 * Does not modify source word text or timestamps.
 */
function mergeShortBlocks(
    inputBlocks: WordTiming[][],
    config: SubtitleConfig,
): WordTiming[][] {
    const blocks = inputBlocks.map((block) => [...block]);

    let index = 0;

    while (index < blocks.length) {
        const current = blocks[index];

        if (!current) {
            index += 1;
            continue;
        }

        if (!isShortBlock(current)) {
            index += 1;
            continue;
        }

        const previous = index > 0
            ? blocks[index - 1]
            : undefined;

        const next = index + 1 < blocks.length
            ? blocks[index + 1]
            : undefined;

        const candidates: Array<{
            direction: 'previous' | 'next';
            gap: number;
        }> = [];

        if (
            previous &&
            canMergeBlocks(previous, current, config)
        ) {
            const previousLast = previous[previous.length - 1];
            const currentFirst = current[0];

            if (previousLast && currentFirst) {
                candidates.push({
                    direction: 'previous',
                    gap: Math.max(
                        0,
                        currentFirst.start - previousLast.end,
                    ),
                });
            }
        }

        if (
            next &&
            canMergeBlocks(current, next, config)
        ) {
            const currentLast = current[current.length - 1];
            const nextFirst = next[0];

            if (currentLast && nextFirst) {
                candidates.push({
                    direction: 'next',
                    gap: Math.max(
                        0,
                        nextFirst.start - currentLast.end,
                    ),
                });
            }
        }

        candidates.sort((a, b) => a.gap - b.gap);

        const selected = candidates[0];

        if (!selected) {
            index += 1;
            continue;
        }

        if (selected.direction === 'previous') {
            // The previous block was checked before adding it as a candidate.
            if (!previous) {
                index += 1;
                continue;
            }

            blocks[index - 1] = [
                ...previous,
                ...current,
            ];

            blocks.splice(index, 1);

            index = Math.max(0, index - 1);
            continue;
        }

        // The next block was checked before adding it as a candidate.
        if (!next) {
            index += 1;
            continue;
        }

        blocks[index] = [
            ...current,
            ...next,
        ];

        blocks.splice(index + 1, 1);
    }

    return blocks;
}

type LayoutUnit = {
    words: WordTiming[];
    /** Set for a paired block: index of the first word of the second row. */
    rowBreak?: number;
};

/** A boundary caused by a pause or sentence punctuation (not by a size limit). */
function isNaturalBoundary(
    left: WordTiming[],
    right: WordTiming[],
    config: SubtitleConfig,
): boolean {
    const leftLast = left[left.length - 1];
    const rightFirst = right[0];

    if (!leftLast || !rightFirst) {
        return false;
    }

    return startsNewPhrase(leftLast, rightFirst, config);
}

function canPairBlocks(
    blocks: WordTiming[][],
    index: number,
    config: SubtitleConfig,
): boolean {
    const left = blocks[index];
    const right = blocks[index + 1];
    const leftLast = left?.[left.length - 1];
    const rightLast = right?.[right.length - 1];
    const leftFirst = left?.[0];
    const rightFirst = right?.[0];

    if (!left || !right || !leftLast || !rightLast || !leftFirst || !rightFirst) {
        return false;
    }

    const maxChars = config.typography.maxCharsPerLine;

    // Both sentences must fit one row each.
    if (lengthOf(left) > maxChars || lengthOf(right) > maxChars) {
        return false;
    }

    // The two sentences are complete: the boundary between them is natural
    // and neither is a fragment cut off by a size limit from its neighbour.
    if (!isNaturalBoundary(left, right, config)) {
        return false;
    }

    const before = blocks[index - 1];
    const after = blocks[index + 2];

    if (before && !isNaturalBoundary(before, left, config)) {
        return false;
    }

    if (after && !isNaturalBoundary(right, after, config)) {
        return false;
    }

    const gap = rightFirst.start - leftLast.end;

    // Whisper may overlap neighbouring words by a few tens of milliseconds.
    return (
        gap >= -0.2 &&
        gap <= config.layout.pairMaxGapSeconds &&
        rightLast.end - leftFirst.start <= config.layout.pairMaxSpanSeconds &&
        left.length + right.length <= config.layout.maxWordsPerBlock
    );
}

/**
 * Joins two neighbouring complete one-row sentences into one block of two
 * rows, so they appear one under the other and leave together.
 */
function pairNeighbourPhrases(
    blocks: WordTiming[][],
    config: SubtitleConfig,
): LayoutUnit[] {
    const units: LayoutUnit[] = [];
    let index = 0;

    while (index < blocks.length) {
        const current = blocks[index];

        if (!current) {
            index += 1;
            continue;
        }

        const next = blocks[index + 1];

        if (
            config.layout.pairPhrases &&
            next &&
            canPairBlocks(blocks, index, config)
        ) {
            units.push({
                words: [...current, ...next],
                rowBreak: current.length,
            });
            index += 2;
            continue;
        }

        units.push({ words: current });
        index += 1;
    }

    return units;
}

function splitLines(
    words: SubtitleWord[],
    maxChars: number,
    maxLines: number,
): SubtitleWord[][] {
    if (!words.length) {
        return [];
    }

    if (words.length === 1 || lengthOf(words) <= maxChars) {
        return [words];
    }

    if (maxLines < 2) {
        throw new Error(
            'Subtitle phrase needs more than the configured number of lines.',
        );
    }

    const bestSplit = findBestSplit(words, maxChars);

    if (bestSplit > 0) {
        return [
            words.slice(0, bestSplit),
            words.slice(bestSplit),
        ];
    }

    throw new Error(
        `Subtitle phrase cannot fit into ${maxLines} lines of ${maxChars} characters. ` +
        'The block should have been split before layout.',
    );
}

function getSubtitleFontScale(
    lines: SubtitleWord[][],
    maxChars: number,
    maxScaleFactor: number,
): number {
    const longestLine = Math.max(
        1,
        ...lines.map(lengthOf),
    );

    return Math.min(
        1,
        maxChars / (longestLine * maxScaleFactor),
    );
}

function normalizePhrase(
    phrase: KeyPhrase,
): {
    tokens: string[];
    color?: string;
    style?: NeonStyle;
} {
    const text = typeof phrase === 'string'
        ? phrase
        : phrase.text;

    return {
        tokens: text
            .split(/\s+/u)
            .map(normalizeSubtitleToken)
            .filter(Boolean),

        color: typeof phrase === 'string'
            ? undefined
            : phrase.color,

        style: typeof phrase === 'string'
            ? undefined
            : phrase.style,
    };
}

function getDisplayText(value: string): string {
    // Remove trailing periods and commas.
    // Keep question marks, exclamation marks and ellipses.
    // Also supports punctuation followed by closing quotes/brackets.
    return value.replace(
        /[.,]+(?=[»”’"')\]]*$)/u,
        '',
    );
}

function assignWordColors(
    input: WordTiming[],
    blockIndex: number,
    config: SubtitleConfig,
    keyPhrases: KeyPhrase[],
): SubtitleWord[] {
    const words: SubtitleWord[] = input.map((word) => {
        const displayText = getDisplayText(word.text);

        return {
            ...word,

            // Only the displayed text is cleaned.
            // Original transcription remains unchanged.
            text: config.typography.uppercase
                ? displayText.toLocaleUpperCase('ru-RU')
                : displayText,

            // Matching and highlighting use original transcription.
            normalized: normalizeSubtitleToken(word.text),

            color: config.colors.white,
            highlighted: false,
        };
    });

    const phrases = keyPhrases
        .map(normalizePhrase)
        .filter((item) => item.tokens.length > 0);

    let paletteIndex =
        blockIndex % Math.max(1, config.colors.palette.length);

    let matched = false;

    for (const phrase of phrases) {
        const tokenCount = phrase.tokens.length;

        for (
            let index = 0;
            index <= words.length - tokenCount;
            index += 1
        ) {
            let isMatch = true;

            // Explicit bounds checks for noUncheckedIndexedAccess.
            for (let offset = 0; offset < tokenCount; offset += 1) {
                const currentWord = words[index + offset];
                const phraseToken = phrase.tokens[offset];

                if (
                    !currentWord ||
                    phraseToken === undefined ||
                    currentWord.normalized !== phraseToken
                ) {
                    isMatch = false;
                    break;
                }
            }

            if (!isMatch) {
                continue;
            }

            const paletteColor = config.colors.palette.length > 0
                ? config.colors.palette[
                paletteIndex % config.colors.palette.length
                    ]
                : undefined;

            const color =
                phrase.color ??
                paletteColor ??
                config.colors.white;

            for (let offset = 0; offset < tokenCount; offset += 1) {
                const matchedWord = words[index + offset];

                if (!matchedWord) {
                    continue;
                }

                matchedWord.color = color;
                matchedWord.highlighted = true;

                if (phrase.style) {
                    matchedWord.neonStyle = phrase.style;
                }
            }

            matched = true;
            paletteIndex += 1;
            index += tokenCount - 1;
        }
    }

    // If no explicit key phrase was matched,
    // highlight the longest meaningful word in the block.
    if (
        !matched &&
        config.colors.autoHighlightLongestWordPerBlock &&
        config.colors.palette.length > 0
    ) {
        const stopWords = new Set(
            config.colors.highlightStopWords.map(normalizeSubtitleToken),
        );

        const candidates = words
            .map((word, index) => ({ word, index }))
            .filter(({ word }) =>
                word.normalized.length >= 4 &&
                !stopWords.has(word.normalized),
            );

        candidates.sort(
            (a, b) =>
                b.word.normalized.length - a.word.normalized.length ||
                a.index - b.index,
        );

        const selected = candidates[0];

        if (selected) {
            const selectedColor =
                config.colors.palette[
                blockIndex % config.colors.palette.length
                    ] ?? config.colors.white;

            selected.word.color = selectedColor;
            selected.word.highlighted = true;
        }
    }

    return words;
}


function rgbHue(hex: string): number {
    const value = hex.replace('#', '');
    const r = Number.parseInt(value.slice(0, 2), 16) / 255;
    const g = Number.parseInt(value.slice(2, 4), 16) / 255;
    const b = Number.parseInt(value.slice(4, 6), 16) / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;

    if (delta === 0) return 0;

    let hue = 0;

    if (max === r) {
        hue = 60 * (((g - b) / delta) % 6);
    } else if (max === g) {
        hue = 60 * ((b - r) / delta + 2);
    } else {
        hue = 60 * ((r - g) / delta + 4);
    }

    return (hue + 360) % 360;
}

function hueDistance(left: number, right: number): number {
    const difference = Math.abs(left - right) % 360;
    return Math.min(difference, 360 - difference);
}

function chooseBlockAccentColor(
    palette: string[],
    blockIndex: number,
    previousColor?: string,
): string | undefined {
    if (palette.length === 0) return undefined;

    if (!previousColor) {
        return palette[blockIndex % palette.length];
    }

    const previousHue = rgbHue(previousColor);
    const candidates = palette
        .map((color, index) => ({
            color,
            index,
            distance: hueDistance(previousHue, rgbHue(color)),
            rotation: (index - blockIndex % palette.length + palette.length) % palette.length,
        }))
        .sort((a, b) =>
            b.distance - a.distance ||
            a.rotation - b.rotation,
        );

    // Prefer a visibly different hue between adjacent blocks.
    return candidates.find(candidate => candidate.distance >= 110)?.color ??
        candidates[0]?.color;
}

/**
 * Reference color rhythm:
 * - a one-line caption remains predominantly white with at most one neon word;
 * - on a two-line caption, the top line has at most one neon word;
 * - the complete lower line uses one neon color.
 */
function applyReferenceLineColors(
    lines: SubtitleWord[][],
    blockIndex: number,
    config: SubtitleConfig,
    previousBlockColor?: string,
): string | undefined {
    const topLine = lines[0] ?? [];
    const bottomLine = lines[1] ?? [];

    const accentColor = chooseBlockAccentColor(
        config.colors.palette,
        blockIndex,
        previousBlockColor,
    );

    const highlightedTopWords = topLine
        .filter(word => word.highlighted)
        .sort((a, b) =>
            b.normalized.length - a.normalized.length ||
            a.start - b.start,
        );

    const keepTopWord = highlightedTopWords[0];

    for (const word of topLine) {
        if (word !== keepTopWord) {
            word.color = config.colors.white;
            word.highlighted = false;
        }
    }

    if (bottomLine.length > 0) {
        const existingBottomAccent = bottomLine.find(word => word.highlighted);
        const existingColor = existingBottomAccent?.color;

        // Preserve an existing/key-phrase color only when it already has
        // enough hue contrast with the previous caption. Otherwise choose
        // the palette color selected by chooseBlockAccentColor().
        const preservesHueContrast =
            existingColor !== undefined &&
            (
                previousBlockColor === undefined ||
                hueDistance(
                    rgbHue(existingColor),
                    rgbHue(previousBlockColor),
                ) >= 110
            );

        const bottomColor = preservesHueContrast
            ? existingColor
            : accentColor;

        if (bottomColor) {
            for (const word of bottomLine) {
                word.color = bottomColor;
                word.highlighted = true;
            }
        }
    }

    return bottomLine.length > 0
        ? bottomLine[0]?.color ?? accentColor
        : keepTopWord?.color ?? accentColor;
}

/**
 * Re-chooses every boundary created only by maxWordsPerBlock or
 * maxBlockDurationSeconds. The two neighbouring chunks are joined and split
 * again at the best word boundary: balanced word counts, a speech gap, a
 * punctuation mark or a following connector ("И", "А", ...) are preferred;
 * a trailing connector or a one-word chunk is penalised. Both chunks must
 * still respect both limits. Natural boundaries (pauses, punctuation) are
 * never moved.
 */
function rebalanceForcedSplits(
    rawBlocks: WordTiming[][],
    forcedSplitAfter: boolean[],
    config: SubtitleConfig,
): void {
    const fits = (chunk: WordTiming[]): boolean =>
        chunk.length > 0 &&
        chunk.length <= config.layout.maxWordsPerBlock &&
        blockDuration(chunk) <= config.layout.maxBlockDurationSeconds;

    for (let index = 0; index < rawBlocks.length - 1; index += 1) {
        if (!forcedSplitAfter[index]) continue;

        const left = rawBlocks[index];
        const right = rawBlocks[index + 1];
        if (!left || !right) continue;

        const combined = [...left, ...right];
        let bestSplit = left.length;
        let bestScore = Number.POSITIVE_INFINITY;

        for (let split = 1; split < combined.length; split += 1) {
            const first = combined.slice(0, split);
            const second = combined.slice(split);
            if (!fits(first) || !fits(second)) continue;

            const lastOfFirst = first[first.length - 1];
            const firstOfSecond = second[0];
            if (!lastOfFirst || !firstOfSecond) continue;

            const lastToken = normalizeSubtitleToken(lastOfFirst.text);
            const nextToken = normalizeSubtitleToken(firstOfSecond.text);
            const gapSeconds = Math.max(0, firstOfSecond.start - lastOfFirst.end);

            const score =
                Math.abs(first.length - second.length) +
                (first.length === 1 || second.length === 1 ? 6 : 0) +
                (CONNECTORS.has(lastToken) ? 5 : 0) -
                (CONNECTORS.has(nextToken) ? 3 : 0) -
                (/[,;:—–-][»”’"')\]]*$/u.test(lastOfFirst.text) ? 3 : 0) -
                Math.min(4, gapSeconds * 20);

            if (score < bestScore) {
                bestScore = score;
                bestSplit = split;
            }
        }

        if (bestSplit !== left.length) {
            rawBlocks[index] = combined.slice(0, bestSplit);
            rawBlocks[index + 1] = combined.slice(bestSplit);
        }
    }
}

export function buildInstagramSubtitleBlocks(
    inputWords: WordTiming[],
    config: SubtitleConfig,
    keyPhrases: KeyPhrase[] = [],
): SubtitleBlock[] {

    if (!inputWords.length) {
        throw new Error(
            'Cannot build subtitles from an empty word list.',
        );
    }

    const words = inputWords
        .filter((word) =>
            word.text.trim().length > 0 &&
            normalizeSubtitleToken(word.text).length > 0 &&
            Number.isFinite(word.start) &&
            Number.isFinite(word.end),
        )
        .map((word) => ({
            ...word,
            text: word.text.trim(),
        }))
        .sort((a, b) => a.start - b.start);

    if (!words.length) {
        throw new Error(
            'Cannot build subtitles: no valid spoken words remain.',
        );
    }

    // Validate all source word timestamps.
    for (let index = 0; index < words.length; index += 1) {
        const word = words[index];

        if (!word) {
            continue;
        }

        if (
            word.start < 0 ||
            word.end <= word.start
        ) {
            throw new Error(
                `Invalid word timestamps at index ${index}: ${JSON.stringify(word)}`,
            );
        }
    }

    // First, split the transcript into raw speech phrases.
    const rawBlocks: WordTiming[][] = [];
    // forcedSplitAfter[i] = the boundary after rawBlocks[i] was caused only by
    // the word/duration limit, not by a pause or punctuation.
    const forcedSplitAfter: boolean[] = [];

    let current: WordTiming[] = [];

    const flush = (forced: boolean) => {
        if (current.length > 0) {
            rawBlocks.push(current);
            forcedSplitAfter.push(forced);
        }

        current = [];
    };

    for (const word of words) {
        const previous = current[current.length - 1];
        const firstCurrentWord = current[0];

        const naturalSplit =
            previous !== undefined &&
            startsNewPhrase(previous, word, config);

        const limitSplit =
            previous !== undefined &&
            firstCurrentWord !== undefined &&
            (
                current.length >= config.layout.maxWordsPerBlock ||

                word.end - firstCurrentWord.start >
                config.layout.maxBlockDurationSeconds
            );

        if (naturalSplit || limitSplit) {
            flush(!naturalSplit);
        }

        current.push(word);
    }

    flush(false);

    // A limit split is greedy: it can cut "...НЕ СТАЛ БЫ ИХ" / "БИТЬ" and
    // leave an orphan word. Move such boundaries to the best place.
    rebalanceForcedSplits(rawBlocks, forcedSplitAfter, config);

    // Merge short phrases before line layout.
    const mergedRawBlocks = mergeShortBlocks(
        rawBlocks,
        config,
    );

    // Pair neighbouring complete sentences into two-row blocks.
    const pairedUnits = pairNeighbourPhrases(mergedRawBlocks, config);

    // Split oversized phrases into deterministic one/two-line chunks.
    const layoutBlocks = pairedUnits.flatMap((unit): LayoutUnit[] => {
        // A paired block already is two fitting rows.
        if (unit.rowBreak !== undefined) {
            return [unit];
        }

        const rawWords = unit.words;
        const chunks: WordTiming[][] = [];

        let chunk: WordTiming[] = [];

        for (const word of rawWords) {
            const candidate = [...chunk, word];

            if (
                chunk.length > 0 &&
                !canFitIntoLines(
                    candidate,
                    config.typography.maxCharsPerLine,
                    config.typography.maxLines,
                    Math.max(
                        1,
                        config.animation.blockScaleEndPercent / 100,
                    ),
                )
            ) {
                chunks.push(chunk);
                chunk = [word];
            } else {
                chunk = candidate;
            }
        }

        if (chunk.length > 0) {
            chunks.push(chunk);
        }

        return chunks.map((words): LayoutUnit => ({ words }));
    });

    // Generate final SubtitleBlock objects.
    let previousBlockAccentColor: string | undefined;

    const blocks = layoutBlocks.map(
        (unit, index): SubtitleBlock => {
            const rawWords = unit.words;

            const coloredWords = assignWordColors(
                rawWords,
                index,
                config,
                keyPhrases,
            );

            const lines = unit.rowBreak !== undefined
                ? [
                    coloredWords.slice(0, unit.rowBreak),
                    coloredWords.slice(unit.rowBreak),
                ]
                : splitLines(
                    coloredWords,
                    config.typography.maxCharsPerLine,
                    config.typography.maxLines,
                );

            const blockAccentColor = applyReferenceLineColors(
                lines,
                index,
                config,
                previousBlockAccentColor,
            );

            if (blockAccentColor) {
                previousBlockAccentColor = blockAccentColor;
            }

            const fontScale = getSubtitleFontScale(
                lines,
                config.typography.maxCharsPerLine,
                Math.max(
                    1,
                    config.animation.blockScaleEndPercent / 100,
                ),
            );

            const firstWord = coloredWords[0];
            const lastWord = coloredWords[coloredWords.length - 1];

            if (!firstWord || !lastWord) {
                throw new Error(
                    `[SUBTITLE LAYOUT] Empty block after processing, index=${index}.`,
                );
            }

            const blockStart = firstWord.start;
            const blockEnd = lastWord.end;

            // Minimum desired display time:
            // at least 700 ms or 250 ms per word.
            const minimumDisplayDuration = Math.max(
                0.7,
                coloredWords.length * 0.25,
            );

            const holdDuration = Math.max(
                0,
                config.layout.holdAfterLastWordSeconds,
            );

            return {
                index,
                words: coloredWords,

                lines,
                fontScale,

                start: blockStart,
                end: blockEnd,

                displayEnd: Math.max(
                    blockEnd + holdDuration,
                    blockStart + minimumDisplayDuration,
                ),
            };
        },
    );

    return blocks;
}
