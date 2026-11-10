import { createRequire } from 'node:module';
import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { analyzeBackgroundLuminance, type BackgroundRegionRequest } from '../utils/analyze-background.js';
import {
    MIN_RIM_PX,
    MIN_TUBE_LINE_PX,
    assignNeonStyles,
    getPlateColor,
    resolveWordMaterial,
    type ResolvedWordMaterial,
} from './neon-material.js';
import {
    assignPhraseFlow,
    getEntryLetterStepMs,
    getWordBaseEntryMs,
    getWordDisplayEndMs,
} from './phrase-flow.js';

import type {
    SoundCue,
    SubtitleBlock,
    SubtitleConfig,
    SubtitleWord,
} from '../types.js';

// fontkit is a runtime dependency (npm install fontkit@2.0.4).
// A local structural type keeps this module independent of @types/fontkit.
const loadCommonJs = createRequire(import.meta.url);

type FontkitBBox = {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
};

type FontkitGlyph = {
    codePoints: number[];
    bbox: FontkitBBox;
};

type FontkitGlyphPosition = {
    xAdvance: number;
    yAdvance: number;
    xOffset: number;
    yOffset: number;
};

type FontkitGlyphRun = {
    glyphs: FontkitGlyph[];
    positions: FontkitGlyphPosition[];
};

type FontkitOs2Table = {
    winAscent?: number;
    winDescent?: number;
    usWinAscent?: number;
    usWinDescent?: number;
};

type FontkitFont = {
    familyName: string;
    unitsPerEm: number;
    capHeight: number;
    ascent: number;
    descent?: number;
    'OS/2'?: FontkitOs2Table;
    layout(
        text: string,
        features?: Record<string, boolean>,
    ): FontkitGlyphRun;
};

type FontkitApi = {
    openSync(filePath: string): FontkitFont;
};

type SourceCharacter = {
    text: string;
    word?: SubtitleWord;
    isWhitespace: boolean;
};

type PositionedGlyph = {
    text: string;
    word: SubtitleWord;
    slotIndex: number;
    waveIndex: number;
    anchorX: number;
    leftX: number;
    rightX: number;
};

type PositionedLine = {
    block: SubtitleBlock;
    lineIndex: number;
    words: SubtitleWord[];
    glyphs: PositionedGlyph[];
    fontScale: number;
    /** Layout em size (fontkit). Glyph events emit it via assFontSizePerEm. */
    fontSizePx: number;
    capHeightPx: number;
    /** libass `\fs` per 1 px of em for the loaded font. */
    assFontSizePerEm: number;
    /** Cap-height centre below the \an5 anchor, in em. */
    capCenterOffsetEm: number;
    lineStartAbsMs: number;
    exitWaveStartAbsMs: number;
    trackingMaxDeltaPx: number;
    trackingMaxDurationMs: number;
    slotCount: number;
    centerX: number;
    centerY: number;
};

type WordExitTiming = {
    phaseAStartAbsMs: number;
    phaseAEndAbsMs: number;
    phaseBEndAbsMs: number;
};

type GlobalWordOrderEntry = {
    word: SubtitleWord;
    blockIndex: number;
    lineIndex: number;
    idx: number;
    sourceStartMs: number;
    sourceEndMs: number;
    scheduledStartMs: number;
    firstAppearanceFrame: number;
};

export type SubtitleAssGenerationOptions = {
    videoPath?: string;
    ffmpegPath?: string;
    frameRate?: number;
    durationSeconds?: number;
    wordOrderReportPath?: string;
};

type PreparedBlock = {
    block: SubtitleBlock;
    exitWaveStartAbsMs: number;
    lines: PositionedLine[];
};

/**
 * Layer layout per block: one plate layer per row first (so no plate can
 * cover a glyph of the other row), then four glyph layers per row.
 */
const GLYPH_LAYERS_PER_LINE = 4;

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function assTime(seconds: number): string {
    const centiseconds = Math.round(Math.max(0, seconds) * 100);
    const hours = Math.floor(centiseconds / 360000);
    const minutes = Math.floor((centiseconds % 360000) / 6000);
    const secs = Math.floor((centiseconds % 6000) / 100);
    const fraction = centiseconds % 100;

    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(fraction).padStart(2, '0')}`;
}

function assColor(hex: string): string {
    const value = hex.replace('#', '');

    if (!/^[0-9a-f]{6}$/iu.test(value)) {
        throw new Error(`[SUBTITLE ASS] Invalid color: ${hex}`);
    }

    return `&H00${value.slice(4, 6)}${value.slice(2, 4)}${value.slice(0, 2)}`.toUpperCase();
}

function assAlpha(alpha: number): string {
    const value = clamp(Math.round(alpha), 0, 255);
    return `&H${value.toString(16).padStart(2, '0').toUpperCase()}&`;
}

function escapeAssText(value: string): string {
    return value
        .replace(/\\/g, '\\\\')
        .replace(/{/g, '\\{')
        .replace(/}/g, '\\}')
        .replace(/[\r\n]+/gu, ' ');
}

function dialogue(
    layer: number,
    startAbsMs: number,
    endAbsMs: number,
    text: string,
): string {
    const safeEnd = Math.max(startAbsMs + 10, endAbsMs);

    return `Dialogue: ${layer},${assTime(startAbsMs / 1000)},${assTime(safeEnd / 1000)},Default,,0,0,0,,${text}`;
}

function formatCoordinate(value: number): string {
    return value.toFixed(2);
}

function getMoveTag(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    durationMs: number,
    startMs = 0,
    endMs = durationMs,
): string {
    const safeStartMs = Math.max(0, Math.round(startMs));
    const safeEndMs = Math.max(safeStartMs + 1, Math.round(endMs));

    if (
        durationMs <= 1 ||
        (
            Math.abs(endX - startX) < 0.01 &&
            Math.abs(endY - startY) < 0.01
        )
    ) {
        return `\\pos(${formatCoordinate(startX)},${formatCoordinate(startY)})`;
    }

    return (
        `\\move(${formatCoordinate(startX)},${formatCoordinate(startY)},` +
        `${formatCoordinate(endX)},${formatCoordinate(endY)},` +
        `${safeStartMs},${safeEndMs})`
    );
}

function getTimedMotionTag(
    motion: {
        startX: number;
        endX: number;
        startTimeMs: number;
        endTimeMs: number;
    },
    startY: number,
    endY: number,
): string {
    return getMoveTag(
        motion.startX,
        startY,
        motion.endX,
        endY,
        motion.endTimeMs - motion.startTimeMs,
        motion.startTimeMs,
        motion.endTimeMs,
    );
}

function loadFont(fontFilePath?: string): FontkitFont {
    const configuredPath =
        fontFilePath ??
        process.env.SUBTITLE_FONT_PATH ??
        path.resolve('public/instagram/fonts/Montserrat-ExtraBold.ttf');

    const absolutePath = path.resolve(configuredPath);

    try {
        const fontkit = loadCommonJs('fontkit') as FontkitApi;
        const font = fontkit.openSync(absolutePath);

        if (!(font.unitsPerEm > 0) || !(font.capHeight > 0)) {
            throw new Error('Font does not expose valid unitsPerEm/capHeight metrics.');
        }

        console.info('[SUBTITLE ASS] Loaded glyph metrics font', {
            path: absolutePath,
            family: font.familyName,
            unitsPerEm: font.unitsPerEm,
            capHeight: font.capHeight,
        });

        return font;
    } catch (error) {
        throw new Error(
            `[SUBTITLE ASS] Cannot load font metrics from "${absolutePath}". ` +
            'Install fontkit@2.0.4, then set SUBTITLE_FONT_PATH or pass fontFilePath. ' +
            'Install the same Montserrat ExtraBold TTF in the FFmpeg fonts directory.',
            { cause: error },
        );
    }
}

/**
 * How libass sizes this font.
 *
 * libass (like VSFilter) does not treat `\fs` as the em size: it scales the
 * face so that the OS/2 winAscent + winDescent box (hhea ascender/descender
 * when OS/2 is missing) equals `\fs`. Fontkit layout, on the other hand, is
 * computed with em = font size. For Montserrat this box is ~1.38 em, so
 * emitting the layout size directly drew every glyph ~28% smaller than the
 * positions computed for it: letters looked widely spaced and the real cap
 * height fell below minimumCapHeightPercentOfWidth. Every glyph event now
 * emits `\fs = em * assFontSizePerEm`, so libass draws exactly the glyphs
 * fontkit measured.
 */
type LibassFontMetrics = {
    /** `\fs` value that makes libass draw a glyph with an em of 1 px. */
    assFontSizePerEm: number;
    /** How far (in em) the cap-height centre sits below the \an5 anchor. */
    capCenterOffsetEm: number;
    source: 'os2-win' | 'hhea' | 'fallback';
};

function getLibassFontMetrics(font: FontkitFont): LibassFontMetrics {
    const unitsPerEm = font.unitsPerEm;
    const os2 = font['OS/2'];
    const winAscent = os2?.winAscent ?? os2?.usWinAscent;
    const winDescent = os2?.winDescent ?? os2?.usWinDescent;

    let boxAscent: number;
    let boxDescent: number;
    let source: LibassFontMetrics['source'];

    if (
        Number.isFinite(winAscent) &&
        Number.isFinite(winDescent) &&
        (winAscent ?? 0) + (winDescent ?? 0) > 0
    ) {
        boxAscent = winAscent ?? 0;
        boxDescent = Math.abs(winDescent ?? 0);
        source = 'os2-win';
    } else if (
        Number.isFinite(font.ascent) &&
        Number.isFinite(font.descent) &&
        font.ascent - (font.descent ?? 0) > 0
    ) {
        boxAscent = font.ascent;
        boxDescent = Math.abs(font.descent ?? 0);
        source = 'hhea';
    } else {
        return { assFontSizePerEm: 1, capCenterOffsetEm: 0, source: 'fallback' };
    }

    return {
        assFontSizePerEm: (boxAscent + boxDescent) / unitsPerEm,
        // \an5 centres the box vertically; caps are centred at capHeight / 2.
        capCenterOffsetEm:
            ((boxAscent - boxDescent) / 2 - font.capHeight / 2) / unitsPerEm,
        source,
    };
}

function buildSourceCharacters(words: SubtitleWord[]): SourceCharacter[] {
    const result: SourceCharacter[] = [];

    words.forEach((word, wordIndex) => {
        for (const character of Array.from(word.text)) {
            result.push({
                text: character,
                word,
                isWhitespace: /^\s+$/u.test(character),
            });
        }

        if (wordIndex < words.length - 1) {
            result.push({
                text: ' ',
                isWhitespace: true,
            });
        }
    });

    return result;
}

function measureLineAtScale(
    run: FontkitGlyphRun,
    font: FontkitFont,
    fontSizePx: number,
    letterSpacingPx: number,
): { minX: number; maxX: number; width: number } {
    const unitScale = fontSizePx / font.unitsPerEm;
    let cursorX = 0;
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;

    for (let index = 0; index < run.glyphs.length; index += 1) {
        const glyph = run.glyphs[index];
        const position = run.positions[index];

        if (!glyph || !position) {
            throw new Error('[SUBTITLE ASS] Font layout returned an incomplete glyph run.');
        }

        const glyphOrigin = cursorX + position.xOffset * unitScale;
        const hasVisibleBounds = glyph.bbox.maxX > glyph.bbox.minX;

        if (hasVisibleBounds) {
            minX = Math.min(minX, glyphOrigin + glyph.bbox.minX * unitScale);
            maxX = Math.max(maxX, glyphOrigin + glyph.bbox.maxX * unitScale);
        }

        cursorX += position.xAdvance * unitScale;

        if (index < run.glyphs.length - 1) {
            cursorX += letterSpacingPx;
        }
    }

    if (!Number.isFinite(minX) || !Number.isFinite(maxX)) {
        throw new Error('[SUBTITLE ASS] Cannot measure a line without visible glyphs.');
    }

    return {
        minX,
        maxX,
        width: maxX - minX,
    };
}

const LAYOUT_CONNECTORS = new Set([
    'И', 'А', 'НО', 'НЕ', 'В', 'ВО', 'НА', 'С', 'СО',
    'ПО', 'К', 'КО', 'У', 'О', 'ОБ', 'ОТ', 'ИЗ',
    'ЗА', 'ПОД', 'НАД', 'ДО', 'ДЛЯ', 'ПРИ', 'ЧЕРЕЗ',
    'ПРО', 'БЕЗ', 'ЧТО', 'ЧТОБЫ', 'КОГДА', 'ПОКА',
]);

function getMinimumFontScale(
    font: FontkitFont,
    width: number,
    height: number,
    config: SubtitleConfig,
): number {
    const videoScale = height / config.canvas.baseHeight;
    const baseFontSizePx = config.typography.fontSizeAtBase * videoScale;
    const capHeightRatio = font.capHeight / font.unitsPerEm;
    const minimumCapHeightPx = width * (
        config.typography.minimumCapHeightPercentOfWidth / 100
    );

    const minimumFontScale = minimumCapHeightPx / (
        baseFontSizePx * capHeightRatio
    );

    if (minimumFontScale > 1.001) {
        throw new Error(
            `[SUBTITLE ASS] Base font is too small: ${minimumCapHeightPx.toFixed(1)}px cap height ` +
            `is required, but ${baseFontSizePx * capHeightRatio}px is available. ` +
            'Increase typography.fontSizeAtBase.',
        );
    }

    return clamp(minimumFontScale, 0, 1);
}

function measureWordsAtScale(
    words: SubtitleWord[],
    font: FontkitFont,
    fontSizePx: number,
    letterSpacingPx: number,
): { text: string; width: number } {
    const sourceCharacters = buildSourceCharacters(words);
    const text = sourceCharacters.map(character => character.text).join('');
    const run = font.layout(text, {
        liga: false,
        clig: false,
        kern: true,
    });

    if (
        run.glyphs.length !== sourceCharacters.length ||
        run.positions.length !== sourceCharacters.length
    ) {
        throw new Error(
            `[SUBTITLE ASS] Font shaping changed the character count for "${text}". ` +
            'The glyph-per-character renderer requires one glyph per Unicode character.',
        );
    }

    return {
        text,
        width: measureLineAtScale(
            run,
            font,
            fontSizePx,
            letterSpacingPx,
        ).width,
    };
}

/**
 * The block builder uses character counts as a fast heuristic. This final
 * pass uses the actual font advances, kerning and glyph bounds. It reflows
 * only when a proposed line cannot fit while preserving the minimum cap
 * height, so normal phrases retain their existing layout.
 */
function reflowBlockLinesByFontMetrics(
    block: SubtitleBlock,
    font: FontkitFont,
    width: number,
    height: number,
    config: SubtitleConfig,
): SubtitleWord[][] {
    const allWords = block.words;

    if (allWords.length === 0) {
        return [];
    }

    const videoScale = height / config.canvas.baseHeight;
    const baseFontSizePx = config.typography.fontSizeAtBase * videoScale;
    const baseSpacingPx = config.typography.letterSpacingAtBase * videoScale;
    const minimumFontScale = getMinimumFontScale(
        font,
        width,
        height,
        config,
    );
    const minimumFontSizePx = baseFontSizePx * minimumFontScale;
    const minimumSpacingPx = baseSpacingPx * minimumFontScale;
    const maximumLineWidth =
        width * config.animation.lineTrackingMaxWidthRatio;

    const measuredWidth = (words: SubtitleWord[]): number =>
        measureWordsAtScale(
            words,
            font,
            minimumFontSizePx,
            minimumSpacingPx,
        ).width;

    const existingLines = block.lines.filter(line => line.length > 0);
    const existingLinesFit =
        existingLines.length > 0 &&
        existingLines.length <= config.typography.maxLines &&
        existingLines.every(line => measuredWidth(line) <= maximumLineWidth + 0.5);

    if (existingLinesFit) {
        return existingLines;
    }

    // Prefer one line when the real font metrics say it fits.
    if (measuredWidth(allWords) <= maximumLineWidth + 0.5) {
        return [allWords];
    }

    if (config.typography.maxLines < 2 || allWords.length < 2) {
        const text = allWords.map(word => word.text).join(' ');
        throw new Error(
            `[SUBTITLE ASS] Phrase cannot fit within ${(config.animation.lineTrackingMaxWidthRatio * 100).toFixed(0)}% ` +
            `of the frame at the minimum cap height (${config.typography.minimumCapHeightPercentOfWidth}%). ` +
            `Phrase: "${text}". Increase maxLines or review the font-size constraint.`,
        );
    }

    let bestSplit: number | undefined;
    let bestScore = Number.POSITIVE_INFINITY;
    let bestWidths: { first: number; second: number } | undefined;

    for (let split = 1; split < allWords.length; split += 1) {
        const first = allWords.slice(0, split);
        const second = allWords.slice(split);
        const firstWidth = measuredWidth(first);
        const secondWidth = measuredWidth(second);

        if (
            firstWidth > maximumLineWidth + 0.5 ||
            secondWidth > maximumLineWidth + 0.5
        ) {
            continue;
        }

        const previousWord = allWords[split - 1];
        const nextWord = allWords[split];

        const previousToken = previousWord?.text
            .toLocaleUpperCase('ru-RU')
            .replace(/[^\p{L}\p{N}Ё]+/gu, '') ?? '';
        const nextToken = nextWord?.text
            .toLocaleUpperCase('ru-RU')
            .replace(/[^\p{L}\p{N}Ё]+/gu, '') ?? '';

        const punctuationBoundary = /[.!?…;:][»”’"')\]]*$/u.test(
            previousWord?.text ?? '',
        );

        const singleWordLinePenalty =
            first.length === 1 || second.length === 1 ? 55 : 0;
        const connectorPenalty =
            (LAYOUT_CONNECTORS.has(previousToken) ? 180 : 0) +
            (LAYOUT_CONNECTORS.has(nextToken) ? 70 : 0);
        const punctuationBonus = punctuationBoundary ? -30 : 0;

        // Prefer balanced physical widths, while respecting word boundaries
        // and avoiding lines that begin/end with grammatical connectors.
        const score =
            Math.abs(firstWidth - secondWidth) +
            singleWordLinePenalty +
            connectorPenalty +
            punctuationBonus;

        if (score < bestScore) {
            bestScore = score;
            bestSplit = split;
            bestWidths = { first: firstWidth, second: secondWidth };
        }
    }

    if (bestSplit !== undefined) {
        const result = [
            allWords.slice(0, bestSplit),
            allWords.slice(bestSplit),
        ];

        console.warn('[SUBTITLE ASS] Reflowed block using actual font metrics', {
            blockIndex: block.index,
            originalLines: existingLines.map(line => line.map(word => word.text).join(' ')),
            resultLines: result.map(line => line.map(word => word.text).join(' ')),
            measuredWidths: bestWidths,
            maximumLineWidth,
            minimumFontScale,
        });

        return result;
    }

    const phrase = allWords.map(word => word.text).join(' ');
    const individualWidths = allWords.map(word => ({
        word: word.text,
        width: measuredWidth([word]),
    }));

    throw new Error(
        `[SUBTITLE ASS] Cannot reflow phrase into ${config.typography.maxLines} lines ` +
        `within ${(config.animation.lineTrackingMaxWidthRatio * 100).toFixed(0)}% of the frame ` +
        `while preserving ${config.typography.minimumCapHeightPercentOfWidth}% cap height. ` +
        `Phrase: "${phrase}". Word widths at minimum size: ${JSON.stringify(individualWidths)}.`,
    );
}

function layoutLine(
    block: SubtitleBlock,
    lineIndex: number,
    words: SubtitleWord[],
    font: FontkitFont,
    width: number,
    height: number,
    config: SubtitleConfig,
    renderedLineCount: number,
): PositionedLine {
    if (words.length === 0) {
        throw new Error('[SUBTITLE ASS] Cannot position an empty line.');
    }

    const sourceCharacters = buildSourceCharacters(words);
    const lineText = sourceCharacters.map(character => character.text).join('');

    // Disable ligatures so that every source character has its own event.
    // Keep kerning enabled; fontkit supplies the pair-position adjustments.
    const run = font.layout(lineText, {
        liga: false,
        clig: false,
        kern: true,
    });

    if (
        run.glyphs.length !== sourceCharacters.length ||
        run.positions.length !== sourceCharacters.length
    ) {
        throw new Error(
            `[SUBTITLE ASS] Font shaping changed the character count for "${lineText}". ` +
            'The glyph-per-character renderer requires one glyph per Unicode character.',
        );
    }

    const videoScale = height / config.canvas.baseHeight;
    const baseFontSizePx = config.typography.fontSizeAtBase * videoScale;
    const baseLetterSpacingPx = config.typography.letterSpacingAtBase * videoScale;
    const minimumFontScale = getMinimumFontScale(
        font,
        width,
        height,
        config,
    );

    const requestedScale = clamp(block.fontScale ?? 1, 0.1, 1);
    const maximumLineWidth = width * config.animation.lineTrackingMaxWidthRatio;

    const measuredAtScaleOne = measureLineAtScale(
        run,
        font,
        baseFontSizePx,
        baseLetterSpacingPx,
    );

    const fitScale = maximumLineWidth / Math.max(1, measuredAtScaleOne.width);

    if (fitScale < minimumFontScale) {
        throw new Error(
            `[SUBTITLE ASS] Line cannot fit within ${(config.animation.lineTrackingMaxWidthRatio * 100).toFixed(0)}% ` +
            `of the frame while keeping cap height >= ${config.typography.minimumCapHeightPercentOfWidth}%. ` +
            `Line: "${lineText}". The font-metric reflow pass did not split this line.`,
        );
    }

    // Respect the block's requested scale, but never let caps fall below 3.2% of frame width.
    const fontScale = clamp(
        Math.max(minimumFontScale, Math.min(requestedScale, fitScale)),
        minimumFontScale,
        1,
    );

    const fontSizePx = baseFontSizePx * fontScale;
    const letterSpacingPx = baseLetterSpacingPx * fontScale;
    const measurement = measureLineAtScale(
        run,
        font,
        fontSizePx,
        letterSpacingPx,
    );

    const unitScale = fontSizePx / font.unitsPerEm;
    const libassMetrics = getLibassFontMetrics(font);
    const visualCenterOffset = (measurement.minX + measurement.maxX) / 2;
    const centerX = width * config.canvas.centerXPercent / 100;
    const originX = centerX - visualCenterOffset;

    // Fixed reference anchors: a one-line phrase always occupies the upper
    // row; a two-line phrase uses the same upper/lower baselines. The block
    // is never vertically re-centered according to its current line count.
    const baselineScale = height / 1920;
    const lineY = (
        lineIndex === 0
            ? config.typography.topLineBaselineAt1080
            : config.typography.bottomLineBaselineAt1080
    ) * baselineScale;

    const glyphs: PositionedGlyph[] = [];
    const slotCount = run.glyphs.length;
    let cursorX = 0;
    let waveIndex = 0;

    for (let index = 0; index < run.glyphs.length; index += 1) {
        const glyph = run.glyphs[index];
        const position = run.positions[index];
        const source = sourceCharacters[index];

        if (!glyph || !position || !source) {
            throw new Error('[SUBTITLE ASS] Missing source character or font glyph.');
        }

        const glyphOrigin = cursorX + position.xOffset * unitScale;
        const glyphLeft = originX + glyphOrigin + glyph.bbox.minX * unitScale;
        const glyphRight = originX + glyphOrigin + glyph.bbox.maxX * unitScale;
        const advancePx = position.xAdvance * unitScale;
        // ASS \an5 anchors a single glyph by its visible bounding box.
        // Use the same visual center from fontkit instead of half the advance;
        // this keeps narrow/wide letters aligned with their real ink bounds.
        const visualGlyphCenter =
            (glyph.bbox.minX + glyph.bbox.maxX) * 0.5 * unitScale;
        const anchorX = originX + glyphOrigin + visualGlyphCenter;

        if (!source.isWhitespace && source.word) {
            glyphs.push({
                text: source.text,
                word: source.word,
                slotIndex: index,
                waveIndex,
                anchorX,
                leftX: glyphLeft,
                rightX: glyphRight,
            });

            waveIndex += 1;
        }

        cursorX += advancePx;

        if (index < run.glyphs.length - 1) {
            cursorX += letterSpacingPx;
        }
    }

    if (glyphs.length === 0) {
        throw new Error(`[SUBTITLE ASS] No visible glyphs in line "${lineText}".`);
    }

    const availableTracking = Math.max(
        0,
        maximumLineWidth - measurement.width,
    );

    const trackingGapCount = Math.max(1, slotCount - 1);
    // Continue expanding at a constant speed until the measured safe-width
    // limit is reached. The previous lineExitLetterSpacing cap stopped the
    // animation even while there was still unused horizontal space.
    const trackingMaxDeltaPx = availableTracking / trackingGapCount;

    const trackingSpeedPxPerSecond =
        config.animation.lineTrackingGrowthEmPerSec * fontSizePx;

    const trackingMaxDurationMs = trackingSpeedPxPerSecond > 0
        ? trackingMaxDeltaPx / trackingSpeedPxPerSecond * 1000
        : 0;

    const rawLineStartAbsMs = Math.min(
        ...words.map(word => word.start * 1000),
    );

    return {
        block,
        lineIndex,
        words,
        glyphs,
        fontScale,
        fontSizePx,
        capHeightPx: font.capHeight * unitScale,
        assFontSizePerEm: libassMetrics.assFontSizePerEm,
        capCenterOffsetEm: libassMetrics.capCenterOffsetEm,
        lineStartAbsMs: rawLineStartAbsMs,
        exitWaveStartAbsMs: 0,
        trackingMaxDeltaPx,
        trackingMaxDurationMs,
        slotCount,
        centerX,
        centerY: lineY,
    };
}

function getTrackingDeltaPx(
    line: PositionedLine,
    absoluteTimeMs: number,
    lineStartAbsMs: number,
    _exitWaveStartAbsMs: number,
    config: SubtitleConfig,
): number {
    // Tracking is a row-level animation. It starts with the row and continues
    // independently of the per-glyph exit wave. It stops only at the measured
    // safe-width limit, never because the first glyph starts disappearing.
    const elapsedMs = clamp(
        absoluteTimeMs - lineStartAbsMs,
        0,
        line.trackingMaxDurationMs,
    );

    const speedPxPerSecond =
        config.animation.lineTrackingGrowthEmPerSec * line.fontSizePx;

    return Math.min(
        line.trackingMaxDeltaPx,
        speedPxPerSecond * elapsedMs / 1000,
    );
}

function getGlyphAnchorAt(
    line: PositionedLine,
    glyph: PositionedGlyph,
    absoluteTimeMs: number,
    lineStartAbsMs: number,
    exitWaveStartAbsMs: number,
    config: SubtitleConfig,
): number {
    const delta = getTrackingDeltaPx(
        line,
        absoluteTimeMs,
        lineStartAbsMs,
        exitWaveStartAbsMs,
        config,
    );

    const centeredSlot = glyph.slotIndex - (line.slotCount - 1) / 2;
    return glyph.anchorX + centeredSlot * delta;
}

function getGlyphBoundsAt(
    line: PositionedLine,
    glyph: PositionedGlyph,
    absoluteTimeMs: number,
    lineStartAbsMs: number,
    exitWaveStartAbsMs: number,
    config: SubtitleConfig,
): { left: number; right: number } {
    const delta = getTrackingDeltaPx(
        line,
        absoluteTimeMs,
        lineStartAbsMs,
        exitWaveStartAbsMs,
        config,
    );

    const centeredSlot = glyph.slotIndex - (line.slotCount - 1) / 2;
    const shift = centeredSlot * delta;

    return {
        left: glyph.leftX + shift,
        right: glyph.rightX + shift,
    };
}

function getEffectiveEntryMs(
    word: SubtitleWord,
    entryDelaysMs: Map<SubtitleWord, number>,
    globalWordStartAbsMs?: Map<SubtitleWord, number>,
): number {
    // Base = phrase-flow display start (lead + even beat); delays come from
    // collision safety; the global schedule is the final word order.
    return globalWordStartAbsMs?.get(word) ?? (
        getWordBaseEntryMs(word) + (entryDelaysMs.get(word) ?? 0)
    );
}

/**
 * Assigns the first visible time of every word from one global timeline.
 * The three-frame separation is enforced across the complete caption stream,
 * not separately for each row. Per-glyph entry still advances at one frame.
 */
function createGlobalWordStartSchedule(
    preparedBlocks: PreparedBlock[],
    entryDelaysMs: Map<SubtitleWord, number>,
    config: SubtitleConfig,
    frameRate: number,
): Map<SubtitleWord, number> {
    const entries: Array<{
        word: SubtitleWord;
        blockIndex: number;
        lineIndex: number;
        idx: number;
        line: PositionedLine;
        firstGlyph: PositionedGlyph;
    }> = [];

    for (let blockIndex = 0; blockIndex < preparedBlocks.length; blockIndex += 1) {
        const block = preparedBlocks[blockIndex];
        if (!block) continue;

        for (const line of block.lines) {
            for (let idx = 0; idx < line.words.length; idx += 1) {
                const word = line.words[idx];
                if (!word) continue;

                const firstGlyph = line.glyphs.find(glyph => glyph.word === word);
                if (!firstGlyph) continue;

                entries.push({
                    word,
                    blockIndex,
                    lineIndex: line.lineIndex,
                    idx,
                    line,
                    firstGlyph,
                });
            }
        }
    }

    entries.sort((a, b) =>
        a.word.start - b.word.start ||
        a.word.end - b.word.end ||
        a.lineIndex - b.lineIndex ||
        a.idx - b.idx ||
        a.blockIndex - b.blockIndex,
    );

    const safeFrameRate = Number.isFinite(frameRate) && frameRate > 0
        ? frameRate
        : 30;
    const frameMs = 1000 / safeFrameRate;
    const minimumGapMs = Math.max(
        frameMs,
        config.animation.entryWordMinGapFrames * frameMs,
    );
    // Letters build the row left to right (entryLetterStepMs); the row's
    // start time comes from the row flow.
    const glyphStepMs = getEntryLetterStepMs(config);
    const schedule = new Map<SubtitleWord, number>();
    let previousWordStartAbsMs = Number.NEGATIVE_INFINITY;

    for (const entry of entries) {
        const lineStartAbsMs = Math.min(
            ...entry.line.words.map(word =>
                getEffectiveEntryMs(word, entryDelaysMs),
            ),
        );
        const sourceAndCollisionStart = getEffectiveEntryMs(
            entry.word,
            entryDelaysMs,
        );
        const leftToRightSlotStart =
            lineStartAbsMs + entry.firstGlyph.waveIndex * glyphStepMs;
        const naturalStartAbsMs = Math.max(
            sourceAndCollisionStart,
            leftToRightSlotStart,
        );
        const requiredStartAbsMs = Math.max(
            naturalStartAbsMs,
            previousWordStartAbsMs + minimumGapMs,
        );
        const frameAlignedStartAbsMs =
            Math.ceil(requiredStartAbsMs / frameMs - 1e-7) * frameMs;

        schedule.set(entry.word, frameAlignedStartAbsMs);
        previousWordStartAbsMs = frameAlignedStartAbsMs;
    }

    return schedule;
}

/**
 * Assigns a left-to-right entrance time to every visible glyph.
 * Word first appearances come from the global schedule; characters within
 * each word/row continue at one source-video frame per glyph.
 */
function createLineEntryTimings(
    line: PositionedLine,
    entryDelaysMs: Map<SubtitleWord, number>,
    config: SubtitleConfig,
    globalWordStartAbsMs?: Map<SubtitleWord, number>,
): Map<PositionedGlyph, number> {
    const result = new Map<PositionedGlyph, number>();
    const lineStartAbsMs = Math.min(
        ...line.words.map(word =>
            getEffectiveEntryMs(word, entryDelaysMs, globalWordStartAbsMs),
        ),
    );
    const stepMs = getEntryLetterStepMs(config);
    let previousEntryAbsMs = Number.NEGATIVE_INFINITY;

    for (const glyph of line.glyphs) {
        const wordEntryAbsMs = getEffectiveEntryMs(
            glyph.word,
            entryDelaysMs,
            globalWordStartAbsMs,
        );
        const scheduledWaveEntryAbsMs =
            lineStartAbsMs + glyph.waveIndex * stepMs;
        const entryAbsMs = Math.max(
            wordEntryAbsMs,
            scheduledWaveEntryAbsMs,
            previousEntryAbsMs + stepMs,
        );

        result.set(glyph, entryAbsMs);
        previousEntryAbsMs = entryAbsMs;
    }

    return result;
}

type OrderedWordReference = {
    word: SubtitleWord;
    blockIndex: number;
    lineIndex: number;
    idx: number;
};

function collectGlobalWordReferences(
    preparedBlocks: PreparedBlock[],
): OrderedWordReference[] {
    const result: OrderedWordReference[] = [];

    for (let blockIndex = 0; blockIndex < preparedBlocks.length; blockIndex += 1) {
        const preparedBlock = preparedBlocks[blockIndex];
        if (!preparedBlock) continue;

        for (const line of preparedBlock.lines) {
            for (let idx = 0; idx < line.words.length; idx += 1) {
                const word = line.words[idx];
                if (!word) continue;
                result.push({
                    word,
                    blockIndex,
                    lineIndex: line.lineIndex,
                    idx,
                });
            }
        }
    }

    return result.sort((a, b) =>
        a.word.start - b.word.start ||
        a.word.end - b.word.end ||
        a.lineIndex - b.lineIndex ||
        a.idx - b.idx ||
        a.blockIndex - b.blockIndex,
    );
}

function getActualWordFirstAppearances(
    preparedBlocks: PreparedBlock[],
    entryDelaysMs: Map<SubtitleWord, number>,
    globalWordStartAbsMs: Map<SubtitleWord, number>,
    config: SubtitleConfig,
): Map<SubtitleWord, number> {
    const actual = new Map<SubtitleWord, number>();

    for (const preparedBlock of preparedBlocks) {
        for (const line of preparedBlock.lines) {
            const entryTimings = createLineEntryTimings(
                line,
                entryDelaysMs,
                config,
                globalWordStartAbsMs,
            );

            for (const glyph of line.glyphs) {
                const glyphEntry = entryTimings.get(glyph);
                if (glyphEntry === undefined) continue;
                const previous = actual.get(glyph.word);
                if (previous === undefined || glyphEntry < previous) {
                    actual.set(glyph.word, glyphEntry);
                }
            }
        }
    }

    return actual;
}

/**
 * Reconciles the global word sequence against the actual first-glyph times.
 * This second pass matters when a line's left-to-right character wave would
 * otherwise push a word past the next word from the other row.
 */
function enforceGlobalWordFirstAppearanceGap(
    preparedBlocks: PreparedBlock[],
    entryDelaysMs: Map<SubtitleWord, number>,
    config: SubtitleConfig,
    frameRate: number,
): Map<SubtitleWord, number> {
    const safeFrameRate = Number.isFinite(frameRate) && frameRate > 0
        ? frameRate
        : 30;
    const frameMs = 1000 / safeFrameRate;
    const orderedWords = collectGlobalWordReferences(preparedBlocks);
    const schedule = createGlobalWordStartSchedule(
        preparedBlocks,
        entryDelaysMs,
        config,
        safeFrameRate,
    );

    for (let pass = 0; pass < orderedWords.length + 2; pass += 1) {
        const actual = getActualWordFirstAppearances(
            preparedBlocks,
            entryDelaysMs,
            schedule,
            config,
        );
        // Compare in whole frames, exactly like the final validation below:
        // letter steps are shorter than a frame, so first-glyph times are not
        // always frame-aligned and a millisecond comparison could pass while
        // the rendered frames are one frame too close.
        const toFrame = (timeMs: number): number =>
            Math.ceil(timeMs / frameMs - 1e-7);
        let previousFrame = Number.NEGATIVE_INFINITY;
        let changed = false;

        for (const entry of orderedWords) {
            const currentStartAbsMs = actual.get(entry.word) ??
                schedule.get(entry.word) ??
                getEffectiveEntryMs(entry.word, entryDelaysMs);
            const currentFrame = toFrame(currentStartAbsMs);
            const requiredFrame = previousFrame + config.animation.entryWordMinGapFrames;

            if (currentFrame < requiredFrame) {
                schedule.set(entry.word, requiredFrame * frameMs);
                changed = true;
                previousFrame = requiredFrame;
            } else {
                previousFrame = currentFrame;
            }
        }

        if (!changed) break;
    }

    // Final hard validation against the actual first glyph event for each word.
    const actual = getActualWordFirstAppearances(
        preparedBlocks,
        entryDelaysMs,
        schedule,
        config,
    );
    let previousFrame = Number.NEGATIVE_INFINITY;

    for (const entry of orderedWords) {
        const firstAppearanceMs = actual.get(entry.word);
        if (firstAppearanceMs === undefined) {
            throw new Error(
                `[SUBTITLE ASS] No first-glyph event was generated for word "${entry.word.text}".`,
            );
        }

        const firstFrame = Math.ceil(firstAppearanceMs / frameMs - 1e-7);
        if (
            Number.isFinite(previousFrame) &&
            firstFrame < previousFrame + config.animation.entryWordMinGapFrames
        ) {
            throw new Error(
                `[SUBTITLE ASS] Global word-order violation near "${entry.word.text}": ` +
                `frame ${firstFrame} must be >= ${previousFrame + config.animation.entryWordMinGapFrames}.`,
            );
        }
        previousFrame = firstFrame;
    }

    return schedule;
}

function createWordOrderReport(
    preparedBlocks: PreparedBlock[],
    entryDelaysMs: Map<SubtitleWord, number>,
    globalWordStartAbsMs: Map<SubtitleWord, number>,
    config: SubtitleConfig,
    frameRate: number,
): {
    entries: GlobalWordOrderEntry[];
    pairChecks: Array<{ before: string; after: string; passed: boolean; present: boolean }>;
} {
    const safeFrameRate = Number.isFinite(frameRate) && frameRate > 0
        ? frameRate
        : 30;
    const frameMs = 1000 / safeFrameRate;
    const actual = getActualWordFirstAppearances(
        preparedBlocks,
        entryDelaysMs,
        globalWordStartAbsMs,
        config,
    );
    const entries: GlobalWordOrderEntry[] = collectGlobalWordReferences(preparedBlocks)
        .map(reference => {
            const firstAppearanceMs = actual.get(reference.word) ??
                globalWordStartAbsMs.get(reference.word) ??
                getEffectiveEntryMs(reference.word, entryDelaysMs);

            return {
                ...reference,
                sourceStartMs: reference.word.start * 1000,
                sourceEndMs: reference.word.end * 1000,
                scheduledStartMs: firstAppearanceMs,
                firstAppearanceFrame: Math.ceil(firstAppearanceMs / frameMs - 1e-7),
            };
        });

    const normalized = (value: string): string =>
        value.toLocaleUpperCase('ru-RU').replace(/[^\p{L}\p{N}Ё]/gu, '');
    const pairDefinitions = [
        { before: 'ТЕБЯ', after: 'НИ' },
        { before: 'ПОКУПАТЕЛЬ', after: 'ПЛАТИТ' },
    ];
    const normalizedEntries = entries.map(entry => normalized(entry.word.text));
    const pairChecks = pairDefinitions.map(pair => {
        const beforeIndex = normalizedEntries.indexOf(pair.before);
        const afterIndex = normalizedEntries.indexOf(pair.after);
        const present = beforeIndex >= 0 && afterIndex >= 0;
        const beforeEntry = present ? entries[beforeIndex] : undefined;
        const afterEntry = present ? entries[afterIndex] : undefined;
        return {
            ...pair,
            present,
            passed: !present || (
                beforeIndex < afterIndex &&
                beforeEntry !== undefined &&
                afterEntry !== undefined &&
                beforeEntry.firstAppearanceFrame < afterEntry.firstAppearanceFrame
            ),
        };
    });

    for (const pair of pairChecks) {
        if (!pair.passed) {
            throw new Error(
                `[SUBTITLE ASS] Regression pair order failed: ${pair.before} must appear before ${pair.after}.`,
            );
        }
    }

    return { entries, pairChecks };
}

function getWordEntryDurationMs(
    word: SubtitleWord,
    config: SubtitleConfig,
): number {
    return word.highlighted
        ? Math.max(config.animation.enterMs, config.animation.neonFillDurationMs)
        : config.animation.enterMs;
}

function getGlyphExitTiming(
    glyph: PositionedGlyph,
    blockExitWaveStartAbsMs: number,
    glyphEntryAbsMs: number,
    config: SubtitleConfig,
    previousWaveStartAbsMs = Number.NEGATIVE_INFINITY,
    frameRate = 30,
): WordExitTiming {
    const entryAbsMs = glyphEntryAbsMs;

    const minimumExitStartAbsMs = Math.max(
        // A word stays at least as long as it is spoken, counted from when
        // it was shown, so the entry lead never shortens its reading time.
        getWordDisplayEndMs(glyph.word),
        entryAbsMs + getWordEntryDurationMs(glyph.word, config) + 30,
    );

    const frameMs = 1000 / (Number.isFinite(frameRate) && frameRate > 0 ? frameRate : 30);
    const quantizeToFrame = (timeMs: number): number =>
        Math.ceil(timeMs / frameMs - 1e-7) * frameMs;
    const scheduledWaveStartAbsMs = quantizeToFrame(
        blockExitWaveStartAbsMs + glyph.waveIndex * config.animation.exitWaveStepMs,
    );

    // If speech timing pushes one letter later than its planned slot, keep
    // the remaining letters at the same left-to-right cadence instead of
    // allowing several letters to collapse onto one timestamp.
    const phaseAStartAbsMs = quantizeToFrame(Math.max(
        scheduledWaveStartAbsMs,
        minimumExitStartAbsMs,
        previousWaveStartAbsMs + config.animation.exitWaveStepMs,
    ));

    const phaseAEndAbsMs =
        phaseAStartAbsMs + config.animation.exitPhaseADurationMs;

    const phaseBEndAbsMs =
        phaseAEndAbsMs + config.animation.exitPhaseBDurationMs;

    return {
        phaseAStartAbsMs,
        phaseAEndAbsMs,
        phaseBEndAbsMs,
    };
}

function createLineExitTimings(
    line: PositionedLine,
    blockExitWaveStartAbsMs: number,
    entryDelaysMs: Map<SubtitleWord, number>,
    config: SubtitleConfig,
    globalWordStartAbsMs?: Map<SubtitleWord, number>,
    frameRate = 30,
): Map<PositionedGlyph, WordExitTiming> {
    const result = new Map<PositionedGlyph, WordExitTiming>();
    const entryTimings = createLineEntryTimings(
        line,
        entryDelaysMs,
        config,
        globalWordStartAbsMs,
    );
    let previousWaveStartAbsMs = Number.NEGATIVE_INFINITY;

    for (const glyph of line.glyphs) {
        const glyphEntryAbsMs = entryTimings.get(glyph);

        if (glyphEntryAbsMs === undefined) {
            throw new Error(
                `[SUBTITLE ASS] Missing entrance timing for glyph "${glyph.text}".`,
            );
        }

        const timing = getGlyphExitTiming(
            glyph,
            blockExitWaveStartAbsMs,
            glyphEntryAbsMs,
            config,
            previousWaveStartAbsMs,
            frameRate,
        );

        result.set(glyph, timing);
        previousWaveStartAbsMs = timing.phaseAStartAbsMs;
    }

    return result;
}

function calculateIncomingEntryDelays(
    preparedBlocks: PreparedBlock[],
    config: SubtitleConfig,
): Map<SubtitleWord, number> {
    const entryDelaysMs = new Map<SubtitleWord, number>();
    const clearanceMs = config.animation.exitWordClearanceMs;

    for (let blockIndex = 1; blockIndex < preparedBlocks.length; blockIndex += 1) {
        const incomingBlock = preparedBlocks[blockIndex];

        if (!incomingBlock) {
            continue;
        }

        // A previous phrase can still be dissolving when a later phrase starts.
        // Inspect every earlier block, not only the immediately preceding one.
        const outgoingLines = preparedBlocks
            .slice(0, blockIndex)
            .flatMap(previousBlock =>
                previousBlock.lines.map(outgoingLine => {
                    const lineStartAbsMs = Math.min(
                        ...outgoingLine.words.map(word =>
                            getEffectiveEntryMs(word, entryDelaysMs),
                        ),
                    );

                    return {
                        previousBlock,
                        line: outgoingLine,
                        lineStartAbsMs,
                        exitTimings: createLineExitTimings(
                            outgoingLine,
                            previousBlock.exitWaveStartAbsMs,
                            entryDelaysMs,
                            config,
                        ),
                    };
                }),
            );

        // Keep the phrase's relative word timing. If an early word is delayed,
        // later words inherit that delay so they cannot overtake it.
        for (const incomingLine of incomingBlock.lines) {
            const orderedWords = [...incomingLine.words].sort(
                (a, b) => getWordBaseEntryMs(a) - getWordBaseEntryMs(b) || a.start - b.start,
            );

            const firstOrderedWord = orderedWords[0];
            if (!firstOrderedWord) {
                continue;
            }

            let inheritedLineDelayMs = 0;
            const rawLineStartMs = getWordBaseEntryMs(firstOrderedWord);

            for (
                let incomingWordIndex = 0;
                incomingWordIndex < orderedWords.length;
                incomingWordIndex += 1
            ) {
                const incomingWord = orderedWords[incomingWordIndex];
                if (!incomingWord) continue;

                const rawEntryMs = getWordBaseEntryMs(incomingWord);
                let delayMs = inheritedLineDelayMs;

                const incomingGlyphs = incomingLine.glyphs.filter(
                    glyph => glyph.word === incomingWord,
                );

                if (incomingGlyphs.length === 0) {
                    entryDelaysMs.set(incomingWord, delayMs);
                    inheritedLineDelayMs = Math.max(inheritedLineDelayMs, delayMs);
                    continue;
                }

                // A small fixed-point pass updates the incoming glyph positions
                // after a collision delay changes the line's tracking timeline.
                for (let iteration = 0; iteration < 3; iteration += 1) {
                    let requiredDelayMs = delayMs;

                    for (const outgoing of outgoingLines) {
                        for (const outgoingGlyph of outgoing.line.glyphs) {
                            const outgoingTiming = outgoing.exitTimings.get(outgoingGlyph);
                            if (!outgoingTiming) continue;

                            // exitCollisionMaxOpacity >= 1: a new word may
                            // overlap an old glyph as soon as that glyph has
                            // started to fade (reference: new words appear on
                            // top of the fading old ones; they are drawn on
                            // higher layers with their own plate).
                            // Below 1: wait until the old contour has faded to
                            // that opacity. Phase B is an ease-in alpha ramp,
                            // so opacity X is reached at fraction
                            // (1 - X)^(1 / accel) of Phase B.
                            const exitAcceleration = Math.max(
                                0.1,
                                config.animation.wordExitEaseInAccel,
                            );
                            const allowedOpacity = clamp(
                                config.animation.exitCollisionMaxOpacity,
                                0,
                                1,
                            );
                            const oldGlyphT30AbsMs = allowedOpacity >= 1
                                ? outgoingTiming.phaseAStartAbsMs
                                : outgoingTiming.phaseAEndAbsMs +
                                    config.animation.exitPhaseBDurationMs *
                                        Math.pow(1 - allowedOpacity, 1 / exitAcceleration);

                            const allowedIncomingAbsMs =
                                oldGlyphT30AbsMs + clearanceMs;

                            // Use the old glyph's actual x-position at t30,
                            // after its row's tracking expansion has completed.
                            const oldBounds = getGlyphBoundsAt(
                                outgoing.line,
                                outgoingGlyph,
                                oldGlyphT30AbsMs,
                                outgoing.lineStartAbsMs,
                                outgoing.previousBlock.exitWaveStartAbsMs,
                                config,
                            );

                            for (const incomingGlyph of incomingGlyphs) {
                                const candidateLineStartAbsMs = rawLineStartMs + (
                                    incomingWordIndex === 0
                                        ? requiredDelayMs
                                        : inheritedLineDelayMs
                                );
                                const candidateEntryAbsMs = Math.max(
                                    rawEntryMs + requiredDelayMs,
                                    candidateLineStartAbsMs +
                                        incomingGlyph.waveIndex * config.animation.exitWaveStepMs,
                                );

                                const incomingBounds = getGlyphBoundsAt(
                                    incomingLine,
                                    incomingGlyph,
                                    candidateEntryAbsMs,
                                    candidateLineStartAbsMs,
                                    incomingBlock.exitWaveStartAbsMs,
                                    config,
                                );

                                const overlaps =
                                    oldBounds.left < incomingBounds.right &&
                                    oldBounds.right > incomingBounds.left;

                                if (overlaps && candidateEntryAbsMs < allowedIncomingAbsMs) {
                                    requiredDelayMs = Math.max(
                                        requiredDelayMs,
                                        allowedIncomingAbsMs - rawEntryMs,
                                    );
                                }
                            }
                        }
                    }

                    if (requiredDelayMs <= delayMs + 0.5) {
                        break;
                    }

                    delayMs = requiredDelayMs;
                }

                delayMs = Math.max(0, Math.round(delayMs));
                entryDelaysMs.set(incomingWord, delayMs);
                inheritedLineDelayMs = Math.max(inheritedLineDelayMs, delayMs);
            }
        }
    }

    return entryDelaysMs;
}

function getRowTrackingStopAbsMs(
    line: PositionedLine,
    entryDelaysMs: Map<SubtitleWord, number>,
    globalWordStartAbsMs?: Map<SubtitleWord, number>,
): number {
    const lineStartAbsMs = Math.min(
        ...line.words.map(word => getEffectiveEntryMs(word, entryDelaysMs, globalWordStartAbsMs)),
    );

    // The only stop condition is the real-font safe-width cap.
    return lineStartAbsMs + line.trackingMaxDurationMs;
}

function getHorizontalMove(
    line: PositionedLine,
    glyph: PositionedGlyph,
    eventStartAbsMs: number,
    eventEndAbsMs: number,
    lineStartAbsMs: number,
    trackingStopAbsMs: number,
    config: SubtitleConfig,
): {
    startX: number;
    endX: number;
    startTimeMs: number;
    endTimeMs: number;
} {
    // Every glyph in a row shares the exact same movement interval.
    // Its Dialogue may start before the row (for the halo lead), but the
    // horizontal expansion itself begins at the row's first visible word.
    const movementStartAbsMs = Math.max(eventStartAbsMs, lineStartAbsMs);
    const movementEndAbsMs = Math.max(
        movementStartAbsMs,
        Math.min(eventEndAbsMs, trackingStopAbsMs),
    );

    const startX = getGlyphAnchorAt(
        line,
        glyph,
        movementStartAbsMs,
        lineStartAbsMs,
        line.exitWaveStartAbsMs,
        config,
    );

    const endX = getGlyphAnchorAt(
        line,
        glyph,
        Math.max(eventStartAbsMs, movementEndAbsMs),
        lineStartAbsMs,
        line.exitWaveStartAbsMs,
        config,
    );

    return {
        startX,
        endX,
        startTimeMs: Math.max(0, movementStartAbsMs - eventStartAbsMs),
        endTimeMs: Math.max(
            Math.max(0, movementStartAbsMs - eventStartAbsMs) + 1,
            movementEndAbsMs - eventStartAbsMs,
        ),
    };
}

/** Ease-in-out transparency ramp used for Phase A and the backing tail. */
function makeEaseInOutFade(
    property: '1a' | '3a',
    startMs: number,
    durationMs: number,
    startAlpha = 0,
): string {
    const safeDuration = Math.max(2, Math.round(durationMs));
    const middleMs = Math.round(startMs + safeDuration / 2);
    const endMs = startMs + safeDuration;
    // The midpoint is interpolated from the actual held alpha to fully
    // transparent. This guarantees monotonic darkening for every glow color.
    const middleAlpha = Math.round(
        clamp(startAlpha, 0, 255) +
        (255 - clamp(startAlpha, 0, 255)) * 0.5,
    );

    return (
        `\\t(${Math.round(startMs)},${middleMs},2,` +
        `\\${property}${assAlpha(middleAlpha)})` +
        `\\t(${middleMs},${endMs},0.5,` +
        `\\${property}&HFF&)`
    );
}

/* -------------------------------------------------------------------------
 * Neon materials
 *
 * Every visible glyph is rendered as a small stack of libass events whose
 * look depends on the word material (see neon-material.ts):
 *
 *   plate (per word)  soft rounded box: neutral for white words, tinted
 *                     with the accent hue for neon words
 *   outer glow        wide soft halo (filled copy, or ring copy for tubes)
 *   inner glow        tight halo
 *   glyph             white letter / glossy neon body + rim / tube line
 *   gloss             top-lit specular sheen bands (filled neon only)
 *   Phase B           contour-only exit event
 *
 * Timing (entry wave, Phase A/B exit, tracking motion) is unchanged: every
 * builder below receives the same per-glyph timing objects as before.
 * ---------------------------------------------------------------------- */

type GlyphEventContext = {
    line: PositionedLine;
    glyph: PositionedGlyph;
    material: ResolvedWordMaterial;
    timing: WordExitTiming;
    eventStartAbsMs: number;
    lineStartAbsMs: number;
    trackingStopAbsMs: number;
    config: SubtitleConfig;
    /** Canvas scale (video height / base height): animation distances. */
    scale: number;
    /**
     * Scale of neon effects (rims, lines, glows, plates). Effects are sized
     * relative to the rendered glyph, not to the canvas, so small captions
     * do not drown in glow: px at base × lineFontSize / designFontSizeAtBase.
     */
    effectScale: number;
    canvasWidth: number;
};

function glyphFontTags(context: GlyphEventContext): string {
    const { config, material } = context;
    return (
        `\\fn${config.typography.fontName}` +
        `\\fs${(material.fontSizePx * context.line.assFontSizePerEm).toFixed(2)}\\fsp0` +
        `\\b${config.typography.bold ? 1 : 0}`
    );
}

/** Motion of an event that lives from its entry until the end of Phase A. */
function phaseAMotionTag(context: GlyphEventContext): string {
    const motion = getHorizontalMove(
        context.line,
        context.glyph,
        context.eventStartAbsMs,
        context.timing.phaseAEndAbsMs,
        context.lineStartAbsMs,
        context.trackingStopAbsMs,
        context.config,
    );

    return getTimedMotionTag(motion, context.line.centerY, context.line.centerY);
}

function getPhaseAWindow(context: GlyphEventContext): {
    startMs: number;
    durationMs: number;
} {
    return {
        startMs: Math.max(
            0,
            Math.round(context.timing.phaseAStartAbsMs - context.eventStartAbsMs),
        ),
        durationMs: Math.max(
            2,
            Math.round(context.timing.phaseAEndAbsMs - context.timing.phaseAStartAbsMs),
        ),
    };
}

/**
 * Neon ignition window. getGlyphExitTiming() already guarantees that Phase A
 * cannot start before getWordEntryDurationMs() has elapsed, so the ignition
 * always completes before the exit begins.
 */
function getIgnitionWindow(config: SubtitleConfig): {
    enterMs: number;
    igniteMs: number;
    flashMs: number;
} {
    const enterMs = Math.max(1, Math.round(config.animation.enterMs));
    const igniteMs = Math.max(
        enterMs + 1,
        Math.round(config.animation.neonFillDurationMs),
    );
    const flashMs = clamp(
        Math.round(igniteMs * config.neon.igniteFlashAt),
        enterMs,
        igniteMs - 1,
    );

    return { enterMs, igniteMs, flashMs };
}

/** Cap height of the glyph actually drawn (after size compensation). */
function getMaterialCapHeightPx(context: GlyphEventContext): number {
    return context.line.capHeightPx * (
        context.material.fontSizePx / Math.max(0.01, context.line.fontSizePx)
    );
}

function tubeLineWidthPx(context: GlyphEventContext): number {
    return Math.max(MIN_TUBE_LINE_PX, context.config.neon.tubeLineWidthAtBase * context.effectScale);
}

function rimWidthPx(context: GlyphEventContext): number {
    return Math.max(MIN_RIM_PX, context.config.neon.rimWidthAtBase * context.effectScale);
}

function whiteOutlineWidthPx(context: GlyphEventContext): number {
    return Math.max(MIN_RIM_PX, context.config.neon.whiteOutlineWidthAtBase * context.effectScale);
}

function makeGlyphCoreEvent(
    context: GlyphEventContext,
    layer: number,
): string {
    const { config, material, scale, effectScale, glyph } = context;
    const neon = config.neon;
    const { enterMs, igniteMs, flashMs } = getIgnitionWindow(config);
    const phaseA = getPhaseAWindow(context);
    const phaseAEnd = phaseA.startMs + phaseA.durationMs;
    const initialBlur = config.animation.enterBlur * scale;
    // 15% visible on the first rendered frame, as before.
    const initialAlpha = 217;
    let style: string;

    if (material.kind === 'tube' && material.palette) {
        // Hollow tube: only the outline ring is drawn. libass cuts the glyph
        // interior out of the border when the fill is transparent, so the
        // tinted plate shows through the letter exactly like the reference.
        const palette = material.palette;
        const lineWidth = tubeLineWidthPx(context);
        const lightUpMs = Math.max(enterMs, Math.round(igniteMs * config.neon.igniteReadableAt));

        style =
            `\\1c${assColor(palette.line)}\\1a&HFF&` +
            `\\3c${assColor(palette.dim)}\\3a${assAlpha(170)}` +
            `\\bord${lineWidth.toFixed(2)}` +
            `\\blur${initialBlur.toFixed(2)}` +
            // The tube lights up from a dim, blurred line to the bright line.
            `\\t(0,${lightUpMs},0.7,` +
            `\\3c${assColor(palette.line)}\\3a&H00&` +
            `\\blur${(neon.tubeLineBlur * effectScale).toFixed(2)})`;
        // The ring is the contour: it survives Phase A and continues in Phase B.
    } else if (material.kind === 'filled' && material.palette) {
        const palette = material.palette;
        const rimWidth = rimWidthPx(context);

        style =
            `\\1c${assColor(palette.dim)}\\1a${assAlpha(200)}` +
            `\\3c${assColor(palette.dim)}\\3a${assAlpha(200)}` +
            `\\bord${rimWidth.toFixed(2)}` +
            `\\blur${initialBlur.toFixed(2)}` +
            // Ignition: unlit → white-hot flash → settled glossy core.
            `\\t(0,${enterMs},0.65,\\1a&H00&\\3a&H00&` +
            `\\blur${(neon.rimBlur * effectScale).toFixed(2)})` +
            `\\t(0,${flashMs},0.8,` +
            `\\1c${assColor(palette.hot)}\\3c${assColor(palette.base)})` +
            `\\t(${flashMs},${igniteMs},1.6,\\1c${assColor(palette.core)})` +
            // Exit Phase A: the body fades, the saturated rim stays as contour.
            makeEaseInOutFade('1a', phaseA.startMs, phaseA.durationMs, 0) +
            `\\t(${phaseA.startMs},${phaseAEnd},1,` +
            `\\3c${assColor(palette.exitContour)})`;
    } else {
        // White word: clean white fill with a faint soft contact shadow
        // instead of the former hard 2.4 px black stroke.
        const outlineWidth = whiteOutlineWidthPx(context);

        style =
            `\\1c${assColor(config.colors.white)}\\1a${assAlpha(initialAlpha)}` +
            `\\3c${assColor(config.colors.outline)}\\3a${assAlpha(initialAlpha)}` +
            `\\bord${outlineWidth.toFixed(2)}` +
            `\\blur${initialBlur.toFixed(2)}` +
            `\\t(0,${enterMs},0.65,\\1a&H00&` +
            `\\3a${assAlpha(neon.whiteOutlineAlpha)}` +
            `\\blur${(neon.whiteOutlineBlur * effectScale).toFixed(2)})` +
            // Exit Phase A: the white fill fades to a translucent grey while
            // the dark contact edge firms up slightly; Phase B dissolves that
            // dark contour (as the white words of the reference do).
            makeEaseInOutFade('1a', phaseA.startMs, phaseA.durationMs, 0) +
            `\\t(${phaseA.startMs},${phaseAEnd},1,` +
            `\\3a${assAlpha(neon.whiteExitContourAlpha)})`;
    }

    return dialogue(
        layer,
        context.eventStartAbsMs,
        context.timing.phaseAEndAbsMs,
        `{\\an5${phaseAMotionTag(context)}${glyphFontTags(context)}${style}}` +
        escapeAssText(glyph.text),
    );
}

/**
 * Top-lit specular sheen of filled neon glyphs: white copies of the glyph
 * clipped to horizontal bands in the upper part of the cap height, with the
 * opacity decreasing downwards. This produces the glossy, glass-like
 * highlight of the reference letters. libass clips are hard, so several thin
 * bands are used as a stepped gradient.
 */
function makeGlossEvents(
    context: GlyphEventContext,
    layer: number,
): string[] {
    const { config, material, effectScale, glyph, line } = context;
    const neon = config.neon;

    if (material.kind !== 'filled' || !neon.glossEnabled) return [];

    const bands = clamp(Math.round(neon.glossBands), 1, 6);
    const coverage = clamp(neon.glossCoverage, 0.05, 1);
    const capHeight = getMaterialCapHeightPx(context);
    // Caps are not centred on the \an5 anchor: use the real cap centre.
    const capCenterY = line.centerY + line.capCenterOffsetEm * material.fontSizePx;
    const top = capCenterY - capHeight / 2 - 2 * effectScale;
    const bottom = capCenterY - capHeight / 2 + capHeight * coverage;
    const bandHeight = (bottom - top) / bands;
    const { igniteMs, flashMs } = getIgnitionWindow(config);
    const phaseA = getPhaseAWindow(context);
    const motionAndFont = `${phaseAMotionTag(context)}${glyphFontTags(context)}`;
    const events: string[] = [];

    for (let band = 0; band < bands; band += 1) {
        const bandAlpha = Math.round(
            neon.glossAlpha + (255 - neon.glossAlpha) * (band / bands),
        );
        const y0 = top + band * bandHeight;
        const y1 = band === bands - 1 ? bottom : y0 + bandHeight;
        const clip =
            `\\clip(0,${formatCoordinate(y0)},` +
            `${context.canvasWidth},${formatCoordinate(y1)})`;

        events.push(dialogue(
            layer,
            context.eventStartAbsMs,
            context.timing.phaseAEndAbsMs,
            `{\\an5${motionAndFont}` +
            `\\1c&HFFFFFF&\\1a&HFF&\\bord0\\shad0` +
            `\\blur${(neon.glossBlur * effectScale).toFixed(2)}${clip}` +
            // The sheen appears with the ignition flash and settles with it.
            `\\t(${flashMs},${igniteMs},1,\\1a${assAlpha(bandAlpha)})` +
            makeEaseInOutFade('1a', phaseA.startMs, phaseA.durationMs, bandAlpha) +
            `}${escapeAssText(glyph.text)}`,
        ));
    }

    return events;
}

function makeGlyphPhaseBEvent(
    context: GlyphEventContext,
    entryDelaysMs: Map<SubtitleWord, number>,
    globalWordStartAbsMs: Map<SubtitleWord, number>,
    layer: number,
): string {
    // Phase B is contour-only: the body has already faded in Phase A.
    const { line, glyph, timing, config, material, scale, effectScale } = context;
    const neon = config.neon;
    const startAbsMs = timing.phaseAEndAbsMs;
    const endAbsMs = timing.phaseBEndAbsMs;
    const lineStartAbsMs = Math.min(
        ...line.words.map(word => getEffectiveEntryMs(
            word,
            entryDelaysMs,
            globalWordStartAbsMs,
        )),
    );
    const startX = getGlyphAnchorAt(
        line,
        glyph,
        startAbsMs,
        lineStartAbsMs,
        line.exitWaveStartAbsMs,
        config,
    );
    const endX = getGlyphAnchorAt(
        line,
        glyph,
        endAbsMs,
        lineStartAbsMs,
        line.exitWaveStartAbsMs,
        config,
    );

    const durationMs = Math.max(1, endAbsMs - startAbsMs);
    const exitEaseIn = Math.max(0.1, config.animation.wordExitEaseInAccel);
    const exitBlur = config.animation.exitGlyphBlurPx * scale;

    // Each material continues exactly the contour its Phase A event ended with.
    let contourColor: string;
    let contourAlpha: number;
    let contourWidth: number;
    let contourBlur: number;

    if (material.kind === 'tube' && material.palette) {
        contourColor = material.palette.line;
        contourAlpha = 0;
        contourWidth = tubeLineWidthPx(context);
        contourBlur = neon.tubeLineBlur * effectScale;
    } else if (material.kind === 'filled' && material.palette) {
        contourColor = material.palette.exitContour;
        contourAlpha = 0;
        contourWidth = rimWidthPx(context);
        contourBlur = neon.rimBlur * effectScale;
    } else {
        contourColor = config.colors.outline;
        contourAlpha = neon.whiteExitContourAlpha;
        contourWidth = whiteOutlineWidthPx(context);
        contourBlur = neon.whiteOutlineBlur * effectScale;
    }

    const tags =
        `{\\an5` +
        getMoveTag(
            startX,
            line.centerY,
            endX,
            line.centerY - config.animation.exitGlyphShiftPx * scale,
            durationMs,
        ) +
        glyphFontTags(context) +
        `\\1c${assColor(contourColor)}` +
        `\\3c${assColor(contourColor)}` +
        `\\bord${contourWidth.toFixed(2)}` +
        `\\blur${contourBlur.toFixed(2)}` +
        `\\1a&HFF&\\3a${assAlpha(contourAlpha)}` +
        `\\t(0,${Math.round(durationMs)},${exitEaseIn},` +
        `\\3a&HFF&\\blur${Math.max(exitBlur, contourBlur).toFixed(2)})}`;

    return dialogue(
        layer,
        startAbsMs,
        endAbsMs,
        `${tags}${escapeAssText(glyph.text)}`,
    );
}

function makeGlowEvent(
    context: GlyphEventContext,
    layer: number,
    kind: 'outerGlow' | 'innerGlow',
): string | undefined {
    // Glow and letter start at the same time. There is no dark/halo-only lead.
    // The glow fades during Phase A; Phase B is reserved for the contour.
    const { config, material, scale, effectScale, glyph } = context;
    const neon = config.neon;
    const glowConfig = config.glow;

    if (!glowConfig.enabled) return undefined;

    const { enterMs, igniteMs } = getIgnitionWindow(config);
    const phaseA = getPhaseAWindow(context);
    const initialAlpha = 217;
    let style: string;
    let fadeTags: string;

    if (material.kind === 'tube' && material.palette) {
        // Tube glows are blurred copies of the outline ring only, so they do
        // not fill the hollow letters and the dark plate stays visible inside.
        const isOuter = kind === 'outerGlow';
        const width = (isOuter ? neon.tubeGlowWidthAtBase : neon.tubeHaloWidthAtBase) * effectScale;
        const blur = (isOuter ? neon.tubeGlowBlur : neon.tubeHaloBlur) * effectScale;
        const targetAlpha = isOuter ? neon.tubeGlowAlpha : neon.tubeHaloAlpha;
        const rampMs = Math.max(enterMs, Math.round(igniteMs * config.neon.igniteReadableAt));

        style =
            `\\1c${assColor(material.palette.base)}\\1a&HFF&` +
            `\\3c${assColor(material.palette.base)}\\3a${assAlpha(initialAlpha)}` +
            `\\bord${width.toFixed(2)}` +
            `\\blur${(blur + config.animation.enterBlur * scale).toFixed(2)}` +
            `\\t(0,${rampMs},0.65,\\3a${assAlpha(targetAlpha)}\\blur${blur.toFixed(2)})`;
        fadeTags = makeEaseInOutFade('3a', phaseA.startMs, phaseA.durationMs, targetAlpha);
    } else if (material.kind === 'filled' && material.palette) {
        const isOuter = kind === 'outerGlow';
        const blur = (isOuter ? glowConfig.outerBlur : glowConfig.innerBlur) * effectScale;
        const targetAlpha = isOuter ? glowConfig.outerAlpha : glowConfig.innerAlpha;
        const spread = neon.glowSpreadAtBase * effectScale * (isOuter ? 1 : 0.6);
        const rampMs = Math.max(enterMs, Math.round(igniteMs * config.neon.igniteReadableAt));

        style =
            `\\1c${assColor(material.palette.base)}\\1a${assAlpha(initialAlpha)}` +
            `\\3c${assColor(material.palette.base)}\\3a${assAlpha(initialAlpha)}` +
            `\\bord${spread.toFixed(2)}` +
            `\\blur${(blur + config.animation.enterBlur * scale).toFixed(2)}` +
            `\\t(0,${rampMs},0.65,\\1a${assAlpha(targetAlpha)}` +
            `\\3a${assAlpha(targetAlpha)}\\blur${blur.toFixed(2)})`;
        fadeTags =
            makeEaseInOutFade('1a', phaseA.startMs, phaseA.durationMs, targetAlpha) +
            makeEaseInOutFade('3a', phaseA.startMs, phaseA.durationMs, targetAlpha);
    } else {
        // White words keep only a faint white bloom.
        const isOuter = kind === 'outerGlow';
        const blur = (isOuter ? glowConfig.outerBlur : glowConfig.innerBlur) * effectScale;
        const targetAlpha = isOuter ? glowConfig.whiteOuterAlpha : glowConfig.whiteInnerAlpha;

        if (targetAlpha >= 255) return undefined;

        style =
            `\\1c${assColor(config.colors.white)}\\1a${assAlpha(initialAlpha)}` +
            `\\3c${assColor(config.colors.white)}\\3a&HFF&\\bord0` +
            `\\blur${(blur + config.animation.enterBlur * scale).toFixed(2)}` +
            `\\t(0,${enterMs},0.65,\\1a${assAlpha(targetAlpha)}\\blur${blur.toFixed(2)})`;
        fadeTags = makeEaseInOutFade('1a', phaseA.startMs, phaseA.durationMs, targetAlpha);
    }

    return dialogue(
        layer,
        context.eventStartAbsMs,
        context.timing.phaseAEndAbsMs,
        `{\\an5${phaseAMotionTag(context)}${glyphFontTags(context)}${style}${fadeTags}}` +
        escapeAssText(glyph.text),
    );
}

/** Rounded rectangle in ASS drawing syntax, with non-negative coordinates. */
function roundedRectanglePath(width: number, height: number, radius: number): string {
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    const r = clamp(radius, 0, Math.min(w, h) / 2);
    const f = (value: number): string => value.toFixed(2);

    if (r < 0.01) {
        return `m 0 0 l ${f(w)} 0 ${f(w)} ${f(h)} 0 ${f(h)}`;
    }

    return (
        `m ${f(r)} 0 l ${f(w - r)} 0 b ${f(w)} 0 ${f(w)} 0 ${f(w)} ${f(r)} ` +
        `l ${f(w)} ${f(h - r)} b ${f(w)} ${f(h)} ${f(w)} ${f(h)} ${f(w - r)} ${f(h)} ` +
        `l ${f(r)} ${f(h)} b 0 ${f(h)} 0 ${f(h)} 0 ${f(h - r)} ` +
        `l 0 ${f(r)} b 0 0 0 0 ${f(r)} 0`
    );
}

/**
 * One soft rounded plate per word (replaces the former per-glyph blurred
 * black glyph copies). It starts with the word's first glyph and grows to the
 * right together with the letters (left-anchored, width keyframed per glyph),
 * so plate and text appear as one piece. It follows the
 * row tracking (centre via \move, width via \fscx, both linear like the
 * glyph motion) and fades while the exit wave crosses the word, finishing
 * exitBackingTailMs after the word's last contour.
 */
function makeWordPlateEvent(
    line: PositionedLine,
    wordGlyphs: PositionedGlyph[],
    material: ResolvedWordMaterial,
    entryTimings: Map<PositionedGlyph, number>,
    exitTimings: Map<PositionedGlyph, WordExitTiming>,
    lineStartAbsMs: number,
    trackingStopAbsMs: number,
    plateAlpha: number,
    config: SubtitleConfig,
    layer: number,
    effectScale: number,
): string | undefined {
    const neon = config.neon;
    if (!neon.plateEnabled || wordGlyphs.length === 0 || plateAlpha >= 255) {
        return undefined;
    }

    const entries: number[] = [];
    const exits: WordExitTiming[] = [];

    for (const glyph of wordGlyphs) {
        const entry = entryTimings.get(glyph);
        const exit = exitTimings.get(glyph);
        if (entry === undefined || !exit) {
            throw new Error(`[SUBTITLE ASS] Missing plate timing for glyph "${glyph.text}".`);
        }
        entries.push(entry);
        exits.push(exit);
    }

    const startAbsMs = Math.min(...entries);
    const endAbsMs =
        Math.max(...exits.map(exit => exit.phaseBEndAbsMs)) +
        config.animation.exitBackingTailMs;
    const firstPhaseAStartAbsMs = Math.min(...exits.map(exit => exit.phaseAStartAbsMs));
    const lastPhaseBEndAbsMs = Math.max(...exits.map(exit => exit.phaseBEndAbsMs));

    const movementStartAbsMs = Math.max(startAbsMs, lineStartAbsMs);
    const movementEndAbsMs = Math.max(
        movementStartAbsMs,
        Math.min(endAbsMs, trackingStopAbsMs),
    );

    const boundsAt = (timeMs: number): { left: number; right: number } => {
        const bounds = wordGlyphs.map(glyph => getGlyphBoundsAt(
            line,
            glyph,
            timeMs,
            lineStartAbsMs,
            line.exitWaveStartAbsMs,
            config,
        ));
        return {
            left: Math.min(...bounds.map(item => item.left)),
            right: Math.max(...bounds.map(item => item.right)),
        };
    };

    const isTube = material.kind === 'tube';
    const capHeight = line.capHeightPx;
    const padX = capHeight * (isTube ? neon.tubePlatePadX : neon.platePadX);
    const padY = capHeight * (isTube ? neon.tubePlatePadY : neon.platePadY);
    const startBounds = boundsAt(movementStartAbsMs);
    const endBounds = boundsAt(movementEndAbsMs);
    const startWidth = Math.max(1, startBounds.right - startBounds.left + 2 * padX);
    const endWidth = Math.max(1, endBounds.right - endBounds.left + 2 * padX);
    const height = Math.max(1, capHeight + 2 * padY);
    const centerY =
        line.centerY +
        line.capCenterOffsetEm * line.fontSizePx +
        capHeight * neon.plateOffsetY;

    const moveStartMs = Math.max(0, Math.round(movementStartAbsMs - startAbsMs));
    const moveEndMs = Math.max(moveStartMs, Math.round(movementEndAbsMs - startAbsMs));

    // The plate is anchored at its left edge (\an4) and grows to the right
    // together with the letters: its right edge reaches each glyph when that
    // glyph appears, so the plate and the text are one piece instead of a
    // full-width box waiting for the letters.
    const plateLeftStart = startBounds.left - padX;
    const plateLeftEnd = endBounds.left - padX;
    const moveTag = getMoveTag(
        plateLeftStart,
        centerY,
        plateLeftEnd,
        centerY,
        moveEndMs - moveStartMs,
        moveStartMs,
        moveEndMs,
    );

    const glyphReveal = wordGlyphs
        .map((glyph, index) => ({
            atMs: Math.max(0, Math.round((entries[index] ?? startAbsMs) - startAbsMs)),
            right: getGlyphBoundsAt(
                line,
                glyph,
                movementStartAbsMs,
                lineStartAbsMs,
                line.exitWaveStartAbsMs,
                config,
            ).right,
        }))
        .sort((left, right) => left.atMs - right.atMs);
    const revealSteps: Array<{ atMs: number; percent: number }> = [];
    let revealRight = Number.NEGATIVE_INFINITY;
    for (const item of glyphReveal) {
        revealRight = Math.max(revealRight, item.right);
        const widthAtStep = Math.max(1, revealRight - startBounds.left + 2 * padX);
        const percent = Math.min(100, widthAtStep / startWidth * 100);
        const previous = revealSteps[revealSteps.length - 1];
        if (previous && previous.atMs === item.atMs) {
            previous.percent = Math.max(previous.percent, percent);
        } else {
            revealSteps.push({ atMs: item.atMs, percent });
        }
    }

    const firstReveal = revealSteps[0];
    const initialPercent = firstReveal ? firstReveal.percent : 100;
    let revealTags = initialPercent < 99.9 ? `\\fscx${initialPercent.toFixed(2)}` : '';
    let revealEndMs = 0;
    for (let index = 1; index < revealSteps.length; index += 1) {
        const previous = revealSteps[index - 1];
        const step = revealSteps[index];
        if (!previous || !step || step.atMs <= previous.atMs) continue;
        revealTags +=
            `\\t(${previous.atMs},${step.atMs},\\fscx${step.percent.toFixed(2)})`;
        revealEndMs = step.atMs;
    }

    // Row tracking changes the word width a little; it continues after the
    // reveal (the reveal itself is computed at the start bounds).
    const trackingFromMs = Math.max(moveStartMs, revealEndMs);
    const widthTag = moveEndMs > trackingFromMs && Math.abs(endWidth - startWidth) > 0.05
        ? `\\t(${trackingFromMs},${moveEndMs},\\fscx${(endWidth / startWidth * 100).toFixed(3)})`
        : '';

    const enterMs = Math.max(1, Math.round(config.animation.enterMs));
    // The plate fades together with the letters: it starts with the first
    // glyph's Phase A and is front-loaded (accel < 1), so no empty box is left
    // behind while only thin contours remain. It is fully transparent when
    // the last contour ends; the event itself still lasts exitBackingTailMs
    // longer, as before.
    const fadeStartMs = Math.max(
        enterMs + 1,
        Math.round(firstPhaseAStartAbsMs - startAbsMs),
    );
    const fadeEndMs = Math.max(
        fadeStartMs + 1,
        Math.round(lastPhaseBEndAbsMs - startAbsMs),
    );

    const tags =
        `{\\an4${moveTag}\\p1\\bord0\\shad0` +
        `\\blur${(config.glow.backingBlur * effectScale).toFixed(2)}` +
        `\\1c${assColor(getPlateColor(material, config))}\\1a&HFF&` +
        `\\t(0,${enterMs},0.7,\\1a${assAlpha(plateAlpha)})` +
        revealTags +
        widthTag +
        `\\t(${fadeStartMs},${fadeEndMs},${neon.plateFadeAccel},\\1a&HFF&)}`;

    return dialogue(
        layer,
        startAbsMs,
        endAbsMs,
        `${tags}${roundedRectanglePath(startWidth, height, height * neon.plateCornerRatio)}`,
    );
}

function createWordBackgroundRequests(
    preparedBlocks: PreparedBlock[],
    entryDelaysMs: Map<SubtitleWord, number>,
    globalWordStartAbsMs: Map<SubtitleWord, number>,
    width: number,
    height: number,
    config: SubtitleConfig,
): {
    requests: BackgroundRegionRequest[];
    wordsById: Map<string, SubtitleWord>;
} {
    const requests: BackgroundRegionRequest[] = [];
    const wordsById = new Map<string, SubtitleWord>();

    for (let blockIndex = 0; blockIndex < preparedBlocks.length; blockIndex += 1) {
        const preparedBlock = preparedBlocks[blockIndex];
        if (!preparedBlock) continue;

        for (const line of preparedBlock.lines) {
            const lineStartAbsMs = Math.min(
                ...line.words.map(word => getEffectiveEntryMs(
                    word,
                    entryDelaysMs,
                    globalWordStartAbsMs,
                )),
            );
            for (let wordIndex = 0; wordIndex < line.words.length; wordIndex += 1) {
                const word = line.words[wordIndex];
                if (!word) continue;

                const wordGlyphs = line.glyphs.filter(glyph => glyph.word === word);
                if (wordGlyphs.length === 0) continue;

                const effectiveWordStart = getEffectiveEntryMs(
                    word,
                    entryDelaysMs,
                    globalWordStartAbsMs,
                ) / 1000;
                const effectiveWordEnd = Math.max(
                    effectiveWordStart,
                    Math.min(
                        preparedBlock.block.displayEnd,
                        Math.max(word.end, effectiveWordStart + 0.12),
                    ),
                );
                const sampleTime = (
                    effectiveWordStart + effectiveWordEnd
                ) * 500;

                const bounds = wordGlyphs.map(glyph => getGlyphBoundsAt(
                    line,
                    glyph,
                    sampleTime,
                    lineStartAbsMs,
                    line.exitWaveStartAbsMs,
                    config,
                ));

                const padding = Math.max(
                    3,
                    config.glow.outlineWidth * (height / config.canvas.baseHeight) + 2,
                );
                const left = Math.max(0, Math.min(...bounds.map(item => item.left)) - padding);
                const right = Math.min(width, Math.max(...bounds.map(item => item.right)) + padding);
                const verticalPadding = line.capHeightPx * 0.18 + padding;
                const capCenterY = line.centerY + line.capCenterOffsetEm * line.fontSizePx;
                const top = Math.max(0, capCenterY - line.capHeightPx * 0.58 - verticalPadding);
                const bottom = Math.min(height, capCenterY + line.capHeightPx * 0.58 + verticalPadding);
                const sampleStart = effectiveWordStart;
                const sampleEnd = Math.max(sampleStart, effectiveWordEnd);
                const sampleOffset = Math.min(0.06, (sampleEnd - sampleStart) / 4);
                const sampleTimesSeconds = [
                    sampleStart + sampleOffset,
                    (sampleStart + sampleEnd) / 2,
                    Math.max(sampleStart, sampleEnd - sampleOffset),
                ];
                const id = `${blockIndex}:${line.lineIndex}:${wordIndex}`;

                requests.push({
                    id,
                    left,
                    top,
                    right,
                    bottom,
                    sampleTimesSeconds,
                });
                wordsById.set(id, word);
            }
        }
    }

    return { requests, wordsById };
}

function toSerializableWordOrderReport(
    report: ReturnType<typeof createWordOrderReport>,
    frameRate: number,
    minimumGapFrames: number,
): object {
    return {
        frameRate,
        minimumGapFrames,
        entries: report.entries.map(entry => ({
            text: entry.word.text,
            start: entry.sourceStartMs / 1000,
            end: entry.sourceEndMs / 1000,
            line: entry.lineIndex + 1,
            idx: entry.idx,
            blockIndex: entry.blockIndex,
            displayStart: entry.word.displayStart,
            firstAppearanceMs: entry.scheduledStartMs,
            firstAppearanceFrame: entry.firstAppearanceFrame,
            leadMs: Math.round(entry.sourceStartMs - entry.scheduledStartMs),
        })),
        pairChecks: report.pairChecks,
    };
}

export function getMaximumDialogueEndSeconds(ass: string): number {
    let maximum = 0;

    for (const line of ass.split(/\r?\n/u)) {
        const match = line.match(/^Dialogue:\s*\d+,([^,]+),([^,]+),/u);
        const value = match?.[2]?.trim();
        if (!value) continue;

        const time = value.match(/^(\d+):(\d{2}):(\d{2})\.(\d{2})$/u);
        if (!time) continue;

        const hours = Number(time[1]);
        const minutes = Number(time[2]);
        const seconds = Number(time[3]);
        const centiseconds = Number(time[4]);
        maximum = Math.max(
            maximum,
            hours * 3600 + minutes * 60 + seconds + centiseconds / 100,
        );
    }

    return maximum;
}


function renderSoundCue(
    cue: SoundCue,
    width: number,
    height: number,
    config: SubtitleConfig,
    scale: number,
    layer: number,
): string | undefined {
    if (!config.soundCues.enabled) return undefined;

    const text = cue.text.trim();
    if (!text) return undefined;

    const start = Math.max(0, cue.start);
    const end = Math.max(
        start + config.soundCues.minDurationSeconds,
        cue.end,
    );

    const x = Math.round(width * config.canvas.centerXPercent / 100);
    const y = Math.round(height * config.soundCues.topPercent / 100);
    const size = config.soundCues.fontSizeAtBase * scale;
    const spacing = config.soundCues.letterSpacingAtBase * scale;
    const border = config.soundCues.outlineWidthAtBase * scale;

    const tags =
        `{\\an8\\pos(${x},${y})\\q2\\fn${config.typography.fontName}` +
        `\\fs${size.toFixed(2)}\\fsp${spacing.toFixed(2)}\\b0\\i1` +
        `\\1c${assColor(config.soundCues.color)}\\1a${assAlpha(config.soundCues.alpha)}` +
        `\\3c${assColor(config.soundCues.outlineColor)}\\3a${assAlpha(config.soundCues.outlineAlpha)}` +
        `\\bord${border.toFixed(2)}\\blur0.35` +
        `\\fad(${config.soundCues.fadeInMs},${config.soundCues.fadeOutMs})}`;

    return dialogue(layer, start * 1000, end * 1000, `${tags}${escapeAssText(text)}`);
}

export async function generateInstagramSubtitleAss(
    blocks: SubtitleBlock[],
    width: number,
    height: number,
    config: SubtitleConfig,
    soundCues: SoundCue[] = [],
    fontFilePath?: string,
    generationOptions: SubtitleAssGenerationOptions = {},
): Promise<string> {
    if (
        !Number.isInteger(width) ||
        !Number.isInteger(height) ||
        width <= 0 ||
        height <= 0
    ) {
        throw new Error(
            `[SUBTITLE ASS] Invalid subtitle canvas ${width}x${height}.`,
        );
    }

    if (blocks.length === 0) {
        throw new Error('Cannot generate ASS: no subtitle blocks.');
    }

    const font = loadFont(fontFilePath);
    const frameRate = Number.isFinite(generationOptions.frameRate) && (generationOptions.frameRate ?? 0) > 0
        ? generationOptions.frameRate!
        : 30;
    const scale = height / config.canvas.baseHeight;
    const margin = Math.round(width * config.canvas.safeMarginPercent / 100);

    const fontMetrics = getLibassFontMetrics(font);
    // Same em → \fs conversion as every glyph event (see LibassFontMetrics).
    const baseFontSize = config.typography.fontSizeAtBase * scale * fontMetrics.assFontSizePerEm;
    const baseSpacing = config.typography.letterSpacingAtBase * scale;
    const outline = config.glow.outlineWidth * scale;

    const header = [
        '[Script Info]',
        'Title: KinomanovNet Per-Glyph Neon Exit Wave',
        'ScriptType: v4.00+',
        `PlayResX: ${width}`,
        `PlayResY: ${height}`,
        'WrapStyle: 2',
        'ScaledBorderAndShadow: yes',
        'YCbCr Matrix: TV.709',
        '',
        '[V4+ Styles]',
        'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
        `Style: Default,${config.typography.fontName},${baseFontSize.toFixed(2)},${assColor(config.colors.white)},${assColor(config.colors.white)},${assColor(config.colors.outline)},${assColor('#000000')},${config.typography.bold ? -1 : 0},0,0,0,100,100,${baseSpacing.toFixed(2)},0,1,${outline.toFixed(2)},0,5,${margin},${margin},0,1`,
        '',
        '[Events]',
        'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    ];

    const preparedBlocks: PreparedBlock[] = blocks.map(block => {
        // The exit wave is scheduled after the row flow (below).
        const exitWaveStartAbsMs = 0;

        const renderedLines = reflowBlockLinesByFontMetrics(
            block,
            font,
            width,
            height,
            config,
        );

        // Keep debug blocks.json consistent with the actual ASS line layout.
        block.lines = renderedLines;

        return {
            block,
            exitWaveStartAbsMs,
            lines: renderedLines.map((lineWords, lineIndex) => {
                const line = layoutLine(
                    block,
                    lineIndex,
                    lineWords,
                    font,
                    width,
                    height,
                    config,
                    renderedLines.length,
                );

                line.exitWaveStartAbsMs = exitWaveStartAbsMs;
                return line;
            }),
        };
    });

    // Row flow: every row appears as a whole, entryLeadMs before its first
    // word is spoken (see phrase-flow.ts).
    const flowSummary = assignPhraseFlow(
        preparedBlocks.map(preparedBlock =>
            preparedBlock.lines.map(line => line.words),
        ),
        config,
    );

    // Exit wave: a phrase leaves exitNoNextDelayMs after its last word has
    // been spoken (timer), or earlier when the next phrase is about to appear
    // (next displayed start - exitTriggerLeadMs). A phrase is never removed
    // before its last word has appeared and been readable for phraseMinHoldMs,
    // so a row cannot start fading while the other row is still being written.
    // (Each glyph additionally finishes its own ignition before Phase A,
    // see getGlyphExitTiming.)
    preparedBlocks.forEach((preparedBlock, blockIndex) => {
        const nextBlock = preparedBlocks[blockIndex + 1];
        const timerMs = Math.max(
            ...preparedBlock.block.words.map(word => word.end),
        ) * 1000 + config.animation.exitNoNextDelayMs;
        const nextStartMs = nextBlock
            ? Math.min(...nextBlock.block.words.map(getWordBaseEntryMs))
            : undefined;
        const triggerMs = nextStartMs !== undefined
            ? Math.min(timerMs, nextStartMs - config.animation.exitTriggerLeadMs)
            : timerMs;
        const holdMs = Math.max(
            ...preparedBlock.block.words.map(word =>
                getWordBaseEntryMs(word) + config.animation.phraseMinHoldMs,
            ),
        );

        preparedBlock.exitWaveStartAbsMs = Math.max(triggerMs, holdMs);
        for (const line of preparedBlock.lines) {
            line.exitWaveStartAbsMs = preparedBlock.exitWaveStartAbsMs;
        }
    });

    // Resolve the neon surface (glossy filled / hollow tube) of every
    // highlighted run once, on the final rendered rows. The result is stored
    // on the words, so blocks.json shows the style that was rendered.
    const tubeRunCount = assignNeonStyles(
        preparedBlocks.map(preparedBlock =>
            preparedBlock.lines.map(line => line.words),
        ),
        config,
    );

    // Calculate local collision delays from exact glyph bounds. A new word is
    // held only when its horizontal area intersects old letters that have not
    // yet passed the requested 30%-readability threshold.
    const entryDelaysMs = calculateIncomingEntryDelays(
        preparedBlocks,
        config,
    );

    // One global word order covers both subtitle rows. Collision clearance
    // can delay an incoming word, but the exit lead never advances its entry.
    const globalWordStartAbsMs = enforceGlobalWordFirstAppearanceGap(
        preparedBlocks,
        entryDelaysMs,
        config,
        frameRate,
    );
    const wordOrderReport = createWordOrderReport(
        preparedBlocks,
        entryDelaysMs,
        globalWordStartAbsMs,
        config,
        frameRate,
    );

    if (generationOptions.wordOrderReportPath) {
        await writeFile(
            generationOptions.wordOrderReportPath,
            `${JSON.stringify(toSerializableWordOrderReport(
                wordOrderReport,
                frameRate,
                config.animation.entryWordMinGapFrames,
            ), null, 2)}\n`,
            'utf8',
        );
    }

    const backingAlphaByWord = new Map<SubtitleWord, number>();
    const brightBackgroundWords = new Set<SubtitleWord>();
    if (generationOptions.videoPath) {
        const backgroundRequests = createWordBackgroundRequests(
            preparedBlocks,
            entryDelaysMs,
            globalWordStartAbsMs,
            width,
            height,
            config,
        );
        const luminanceById = await analyzeBackgroundLuminance({
            videoPath: generationOptions.videoPath,
            width,
            height,
            durationSeconds: generationOptions.durationSeconds ?? Math.max(
                ...blocks.map(block => block.displayEnd),
            ),
            requests: backgroundRequests.requests,
            ffmpegPath: generationOptions.ffmpegPath,
        });

        let brightWordCount = 0;
        for (const [id, luminance] of luminanceById) {
            const word = backgroundRequests.wordsById.get(id);
            if (!word) continue;
            const isBright = luminance > config.glow.backingBrightnessThreshold;
            backingAlphaByWord.set(
                word,
                isBright
                    ? config.glow.backingBrightAlpha
                    : config.glow.backingAlpha,
            );
            if (isBright) {
                brightWordCount += 1;
                brightBackgroundWords.add(word);
            }
        }

        console.info('[SUBTITLE ASS] Adaptive word backing analyzed', {
            sampledWords: luminanceById.size,
            brightWords: brightWordCount,
            threshold: config.glow.backingBrightnessThreshold,
            normalAlpha: config.glow.backingAlpha,
            brightAlpha: config.glow.backingBrightAlpha,
        });
    } else {
        console.warn('[SUBTITLE ASS] Source video was not supplied; using default backing opacity for all words.');
    }

    // Render all glyphs as separate events. Each block receives a higher
    // layer group, so the next phrase always sits above the previous one.
    const events: string[] = [];
    const maxLines = Math.max(1, config.typography.maxLines);
    const blockLayerStride = maxLines * (1 + GLYPH_LAYERS_PER_LINE);
    const materialCounts = { white: 0, filled: 0, tube: 0 };

    for (let blockIndex = 0; blockIndex < preparedBlocks.length; blockIndex += 1) {
        const preparedBlock = preparedBlocks[blockIndex];
        if (!preparedBlock) continue;

        const blockLayerBase = blockIndex * blockLayerStride;

        for (const line of preparedBlock.lines) {
            const lineStartAbsMs = Math.min(
                ...line.words.map(word => getEffectiveEntryMs(
                    word,
                    entryDelaysMs,
                    globalWordStartAbsMs,
                )),
            );

            const lineTrackingStopAbsMs = getRowTrackingStopAbsMs(
                line,
                entryDelaysMs,
                globalWordStartAbsMs,
            );

            const lineEntryTimings = createLineEntryTimings(
                line,
                entryDelaysMs,
                config,
                globalWordStartAbsMs,
            );
            const lineExitTimings = createLineExitTimings(
                line,
                preparedBlock.exitWaveStartAbsMs,
                entryDelaysMs,
                config,
                globalWordStartAbsMs,
                frameRate,
            );

            // Entry is tied only to source/global ordering and collision safety.
            // The 600 ms phrase lead is used exclusively by the exit wave.

            const plateLayer = blockLayerBase + line.lineIndex;
            const glyphLayerBase =
                blockLayerBase +
                maxLines +
                line.lineIndex * GLYPH_LAYERS_PER_LINE;
            const outerGlowLayer = glyphLayerBase;
            const innerGlowLayer = glyphLayerBase + 1;
            const glyphLayer = glyphLayerBase + 2;
            const glossLayer = glyphLayerBase + 3;

            // Neon effects follow the rendered glyph size (see GlyphEventContext).
            const effectScale = line.fontSizePx / Math.max(
                1,
                config.neon.designFontSizeAtBase,
            );

            // One material per word, resolved once for all of its glyphs.
            const materialByWord = new Map<SubtitleWord, ResolvedWordMaterial>();
            for (const word of line.words) {
                const material = resolveWordMaterial(
                    word,
                    line.fontSizePx,
                    line.capHeightPx,
                    effectScale,
                    config,
                );
                materialByWord.set(word, material);
                materialCounts[material.kind] += 1;
            }

            // Word plates: neutral under white words (adaptive luminance
            // opacity), hue-tinted under neon words.
            for (const word of line.words) {
                const material = materialByWord.get(word);
                const wordGlyphs = line.glyphs.filter(glyph => glyph.word === word);
                if (!material || wordGlyphs.length === 0) continue;

                const isBright = brightBackgroundWords.has(word);
                const plateAlpha = material.kind === 'white'
                    ? backingAlphaByWord.get(word) ?? config.glow.backingAlpha
                    : clamp(
                        (material.kind === 'tube'
                            ? config.neon.tubePlateAlpha
                            : config.neon.filledPlateAlpha) -
                        (isBright ? config.neon.brightPlateAlphaBoost : 0),
                        0,
                        255,
                    );

                const plateEvent = makeWordPlateEvent(
                    line,
                    wordGlyphs,
                    material,
                    lineEntryTimings,
                    lineExitTimings,
                    lineStartAbsMs,
                    lineTrackingStopAbsMs,
                    plateAlpha,
                    config,
                    plateLayer,
                    effectScale,
                );
                if (plateEvent) events.push(plateEvent);
            }

            for (const glyph of line.glyphs) {
                const timing = lineExitTimings.get(glyph);
                const glyphEntryAbsMs = lineEntryTimings.get(glyph);
                const material = materialByWord.get(glyph.word);

                if (!timing || glyphEntryAbsMs === undefined || !material) {
                    throw new Error(
                        `[SUBTITLE ASS] Missing per-glyph timing for "${glyph.text}".`,
                    );
                }

                // Plate, halo and glyph enter on the same first-visible
                // frame. No anticipation offset is applied to word entrance.
                const context: GlyphEventContext = {
                    line,
                    glyph,
                    material,
                    timing,
                    eventStartAbsMs: glyphEntryAbsMs,
                    lineStartAbsMs,
                    trackingStopAbsMs: lineTrackingStopAbsMs,
                    config,
                    scale,
                    effectScale,
                    canvasWidth: width,
                };

                const outerGlow = makeGlowEvent(context, outerGlowLayer, 'outerGlow');
                if (outerGlow) events.push(outerGlow);

                const innerGlow = makeGlowEvent(context, innerGlowLayer, 'innerGlow');
                if (innerGlow) events.push(innerGlow);

                events.push(makeGlyphCoreEvent(context, glyphLayer));
                events.push(...makeGlossEvents(context, glossLayer));

                events.push(
                    makeGlyphPhaseBEvent(
                        context,
                        entryDelaysMs,
                        globalWordStartAbsMs,
                        glyphLayer,
                    ),
                );
            }

            // Keep the compiler honest and make line-level timings visible in
            // diagnostics while retaining per-glyph Dialogue events.
            if (lineTrackingStopAbsMs < lineStartAbsMs) {
                console.warn('[SUBTITLE ASS] Tracking window is empty for row', {
                    blockIndex,
                    lineIndex: line.lineIndex,
                    lineStartAbsMs,
                    lineTrackingStopAbsMs,
                });
            }
        }
    }

    const soundCueLayer =
        preparedBlocks.length * blockLayerStride +
        blockLayerStride +
        3;

    for (const cue of soundCues) {
        const event = renderSoundCue(
            cue,
            width,
            height,
            config,
            scale,
            soundCueLayer,
        );

        if (event) events.push(event);
    }

    console.info('[SUBTITLE ASS] Generated per-glyph ASS events', {
        blocks: blocks.length,
        rows: preparedBlocks.reduce((sum, block) => sum + block.lines.length, 0),
        visibleGlyphs: preparedBlocks.reduce(
            (sum, block) => sum + block.lines.reduce(
                (lineSum, line) => lineSum + line.glyphs.length,
                0,
            ),
            0,
        ),
        dialogueEvents: events.length,
        neonMaterials: materialCounts,
        phraseFlow: flowSummary,
        libassFontSize: {
            assFontSizePerEm: Number(fontMetrics.assFontSizePerEm.toFixed(4)),
            source: fontMetrics.source,
        },
        tubeRuns: tubeRunCount,
        font: font.familyName,
        resolution: `${width}x${height}`,
        entryWaveStepMs: config.animation.exitWaveStepMs,
        exitWaveStepMs: config.animation.exitWaveStepMs,
        phaseAms: config.animation.exitPhaseADurationMs,
        phaseBms: config.animation.exitPhaseBDurationMs,
        entryWordMinGapFrames: config.animation.entryWordMinGapFrames,
        globalWordOrderValidation: 'passed',
        checkedWordCount: wordOrderReport.entries.length,
        regressionPairs: wordOrderReport.pairChecks,
    });

    return `${header.join('\n')}\n${events.join('\n')}\n`;
}
