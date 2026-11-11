import type {
    SubtitleConfig,
    SubtitleConfigOverrides,
} from './types.js';

/** Large, fixed-layout neon captions with a separate quiet sound-cue lane. */
export const defaultSubtitleConfig: SubtitleConfig = {
    canvas: {
        baseWidth: 720,
        baseHeight: 1280,
        centerXPercent: 50,
        centerYPercent: 56.15,
        safeMarginPercent: 10,
    },

    typography: {
        fontName: 'Montserrat ExtraBold',
        // Em size at the 720x1280 base. Since the libass \fs correction this is
        // the real glyph size: 21 keeps the letter size of the former 28
        // (which libass drew at ~0.72 em with Montserrat). The reference video
        // corresponds to ~28.
        fontSizeAtBase: 21,
        minimumCapHeightPercentOfWidth: 2.0, // Снижаем планку валидации (было 3.2)
        lineBaselineGapAtBase: 40,
        topLineBaselineAt1080: 1020,
        bottomLineBaselineAt1080: 1070,
        bold: false,
        uppercase: true,
        letterSpacingAtBase: -1,
        maxCharsPerLine: 26,
        maxLines: 2,
    },

    layout: {
        maxWordsPerBlock: 14,
        maxBlockDurationSeconds: 6,
        splitOnPauseSeconds: 1.0,
        holdAfterLastWordSeconds: 0.65,
        // Two short neighbouring sentences become one block of two rows
        // ("НО МЫ ЖЕ ВСЕ ДЕТИ" / "ВЫ НЕ ДЕТИ") that leaves together.
        pairPhrases: true,
        pairMaxGapSeconds: 0.8,
        pairMaxSpanSeconds: 6,
        // Speaker awareness (transcription/speaker-analysis.ts).
        splitOnSpeakerChange: true,
        sameSpeakerContinueSeconds: 2,
    },

    colors: {
        white: '#FFFFFF',
        outline: '#090909',
        // Calmer neon: ~20 % less saturation and a touch less brightness than
        // the previous acid set (#2BFF5A, #D447FF, #F6F826, #33D9FF, #FF2FD0,
        // #FF7A1A, #FF2D45, #A34FFF, #22F5E0, #55B2FF).
        palette: [
            '#4DDC7C',
            '#C063EE',
            '#ECE65F',
            '#5CC8E6',
            '#EE66C8',
            '#F2905A',
            '#EC5E70',
            '#9E76EE',
            '#52D6C6',
            '#76B0F0',
        ],
        autoHighlightLongestWordPerBlock: true,
        highlightStopWords: [
            'И', 'НЕ', 'В', 'НА', 'С', 'ПО', 'А', 'НО',
            'ЭТО', 'Я', 'ТЫ', 'ОН', 'ОНА',
            'ОНИ', 'МЫ', 'ВЫ', 'К', 'У', 'О', 'ОБ',
            'ЗА', 'ИЗ', 'ДО', 'ОТ', 'ПОД', 'НАД',
            'ДЛЯ', 'ЧТО', 'КАК', 'ТО', 'ЖЕ', 'ЛИ',
        ],
    },

    soundCues: {
        enabled: true,
        topPercent: 6.5,
        fontSizeAtBase: 18,
        color: '#B6BBC3',
        alpha: 88,
        outlineColor: '#17191D',
        outlineAlpha: 150,
        outlineWidthAtBase: 0.65,
        letterSpacingAtBase: 0.7,
        minDurationSeconds: 0.7,
        fadeInMs: 90,
        fadeOutMs: 150,
    },

    glow: {
        enabled: true,
        // Softness of the plates behind words (px at base).
        backingBlur: 6,
        // Neutral plate under white words. ASS alpha: 125 ~= 51% opacity; 89 ~= 65% opacity.
        backingAlpha: 125,
        backingBrightAlpha: 89,
        backingBrightnessThreshold: 0.45,
        // ASS alpha: 0 = opaque, 255 = transparent.
        // Filled neon glow: wide soft halo + tight halo (measured on the reference).
        outerBlur: 9,
        outerAlpha: 150,
        innerBlur: 3,
        innerAlpha: 142,
        whiteOuterAlpha: 224,
        whiteInnerAlpha: 238,
        outlineWidth: 2.4,
        // Legacy (pre-material) settings, kept so existing overrides still type-check.
        whiteHotCoreWidthAtBase: 2,
        whiteHotCoreAlpha: 0,
    },

    // Neon materials measured frame-by-frame on the reference video.
    neon: {
        styleMode: 'mixed',
        tubeEveryNthRun: 4,
        tubeRunOffset: 1,
        outlineSizeCompensation: 0.5,
        designFontSizeAtBase: 24,

        // Glossy filled neon.
        fillCoreWhiteMix: 0.2,
        rimWidthAtBase: 0.9,
        rimBlur: 0.6,
        igniteFlashWhiteMix: 0.5,
        igniteStartBrightness: 0.45,
        igniteFlashAt: 0.35,
        // Neon words are fully lit after ~150 ms (was 250–300 ms), so a
        // highlighted word does not read as late; the colour keeps settling.
        igniteReadableAt: 0.3,
        glowSpreadAtBase: 0.8,
        glossEnabled: true,
        glossAlpha: 150,
        glossBands: 3,
        glossCoverage: 0.46,
        glossBlur: 0.7,

        // Hollow tube neon.
        tubeLineWidthAtBase: 1.25,
        tubeLineBlur: 0.5,
        tubeLineWhiteMix: 0.5,
        tubeHaloWidthAtBase: 2.4,
        tubeHaloBlur: 1.6,
        tubeHaloAlpha: 30,
        tubeGlowWidthAtBase: 3.2,
        tubeGlowBlur: 7.5,
        tubeGlowAlpha: 115,

        // Word plates.
        plateEnabled: true,
        platePadX: 0.6,
        platePadY: 0.48,
        tubePlatePadX: 0.5,
        tubePlatePadY: 0.42,
        plateCornerRatio: 0.3,
        plateOffsetY: 0,
        filledPlateBrightness: 0.42,
        filledPlateAlpha: 64,
        tubePlateBrightness: 0.36,
        tubePlateAlpha: 30,
        whitePlateColor: '#3C3C3C',
        brightPlateAlphaBoost: 25,
        plateFadeAccel: 0.6,

        // White words.
        whiteOutlineWidthAtBase: 0.9,
        whiteOutlineAlpha: 165,
        whiteOutlineBlur: 0.9,
        whiteExitContourAlpha: 120,

        exitContourWhiteMix: 0.15,
    },

    animation: {
        // Появление.
        // A word reaches a clear, readable state within six 30-fps frames.
        // White words fade in over ~4–5 frames, like the reference.
        enterMs: 350,
        enterGhostMs: 0,
        enterGhostAlpha: 180,
        enterBlur: 10,

        enterFlashMs: 0,
        enterPeakGlowMultiplier: 1.05,
        enterSettleMs: 300,

        enterScaleDurationMs: 500,
        enterEaseOutAccel: 0.7,

        // Сохранены для совместимости.
        enterInitialColor: '#27132E',
        enterFlashColor: '#FFF0F7',

        // Исчезновение.
        exitMs: 160,
        exitStaggerMs: 40,
        exitWindowMs: 900,
        exitBlur: 0,
        overlapMs: 200,

        scaleOnEnter: true,
        enterScalePercent: 95,

        // Масштаб букв зафиксирован.
        blockScaleStartPercent: 100,
        blockScaleEndPercent: 100,
        blockScaleDurationMs: 3000,

        exitDimMs: 150,
        exitRemainingOpacityPercent: 30,

        // Размытие индивидуальных слов.
        lineExitDurationMs: 600,
        // This is applied to a duplicate glyph with no outline,
        // so the actual letter fill becomes blurred, not only its border.
        lineExitBlur: 14,

        // Retained for backward-compatible config overrides. Tracking is now
        // capped by measured safe width, not by this legacy per-gap value.
        lineExitLetterSpacing: 6,

        // Рост межбуквенного интервала всей строки.
        // 0.058 em/sec — значение из покадрового измерения референса.
        lineTrackingGrowthEmPerSec: 0.058,

        // Строка не должна выйти за безопасную ширину видео.
        lineTrackingMaxWidthRatio: 0.80,

        // Слова растворяются вслед за новыми словами.
        // Incoming words wait until the outgoing word has faded
        // to roughly 30% opacity, plus a small visual clearance.
        wordExitDelayMs: 40,
        wordExitStaggerMs: 110,
        wordExitMinDurationMs: 520,
        wordExitMaxDurationMs: 640,
        wordExitDurationFactor: 0.85,

        // Alpha 0 = opaque, 255 = fully transparent.
        // 180 leaves a visible blurred color cloud before the final tail.
        wordExitGhostAlpha: 180,
        wordExitGhostDurationMs: 120,
        wordExitEaseInAccel: 2,

        // The neon glow starts slightly after the glyph itself.
        // The halo begins before the sharp glyph.
        // Backing, halo and glyph begin together; no dark layer leads the letter.
        glowEnterLeadMs: 0,

        // Character-by-character exit timing.
        // 33.333 ms averages one 30 fps frame per visible character.
        exitWaveStepMs: 20,
        exitPhaseADurationMs: 300,
        exitPhaseBDurationMs: 260,
        exitTriggerLeadMs: 600,
        // A phrase fades this long after its last word was spoken (timer).
        exitNoNextDelayMs: 100,
        // Extra wait after an old glyph reaches exitCollisionMaxOpacity.
        // Was 300 ms: together with the 30% rule it delayed every phrase.
        exitWordClearanceMs: 60,
        exitGlyphBlurPx: 8,
        exitGlyphShiftPx: 4,
        exitBackingTailMs: 180,
        // Neon ignition: unlit → white-hot flash → settled colour (filled),
        // dim → bright line (tube). Also the highlighted-word entry duration.
        neonFillDurationMs: 500,
        // Global word-order spacing applies across both subtitle rows.
        entryWordMinGapFrames: 3,

        // Row flow: a row appears as a whole, one second before its first
        // word is spoken, as a smooth left-to-right sweep (mirror of the exit wave).
        // 'words' (default, as in the reference): each word materialises as a
        // whole just before it is spoken; the lead grows 0.2 → 0.45 s over a
        // sentence. 'row': whole rows appear entryLeadMs ahead of the voice.
        entryMode: 'words',
        entryLeadStartMs: 200,
        entryLeadEndMs: 450,
        entryWordLetterStepMs: 4,
        entryLeadMs: 600,
        entryLetterStepMs: 33.333,
        phraseMinHoldMs: 600,
        exitCollisionMaxOpacity: 1,
    },

    render: {
        videoCodec: 'libx264',
        preset: 'veryfast',
        crf: 18,
        audioCodec: 'copy',
        audioBitrate: '192k',
    },
};

/**
 * Square (1:1) Reel layout. Look approved by the owner on the 11.11 prototype.
 *
 * Letters are 85% of the size measured on the reference video (28 em units on
 * a 720 px wide frame), so fontSizeAtBase is 23.8. The rows keep the fixed
 * baselines of defaultSubtitleConfig, which generate-ass.ts scales by
 * height / 1920. On 1080x1080 that gives an em of about 35.7 px, baselines at
 * y=574 and y=602 (53% and 56% of the height) and 28 px between the rows, so
 * the two rows of a phrase sit close together.
 *
 * The canvas is declared 720x720 because the module scales everything by
 * height / canvas.baseHeight. With the vertical 720x1280 base the letters on a
 * square frame would come out about 44% smaller.
 *
 * Sound cues (separate gray line at the top) stay on but are dimmer than in the
 * vertical layout, as the owner asked on 11.11: ASS alpha 88 -> 150 (about 65%
 * -> 41% opaque), a slightly darker gray and a fainter outline. The hook plate
 * is burned after the subtitle layer, so while it is on screen it covers the
 * cues.
 */
export const squareSubtitleOverrides: SubtitleConfigOverrides = {
    canvas: {
        baseWidth: 720,
        baseHeight: 720,
    },
    typography: {
        fontSizeAtBase: 23.8,
    },
    soundCues: {
        color: '#A4A9B1',
        alpha: 150,
        outlineAlpha: 175,
    },
};

/** Overrides that match the shape of the video being subtitled. */
export function getFormatSubtitleOverrides(
    width: number,
    height: number,
): SubtitleConfigOverrides {
    const isSquare =
        width > 0 &&
        height > 0 &&
        Math.abs(width - height) / Math.max(width, height) <= 0.02;

    return isSquare ? squareSubtitleOverrides : {};
}

/** Merges override layers section by section; later layers win. */
export function mergeSubtitleOverrides(
    ...layers: Array<SubtitleConfigOverrides | undefined>
): SubtitleConfigOverrides {
    const merged: Record<string, Record<string, unknown>> = {};

    for (const layer of layers) {
        if (!layer) continue;

        for (const [section, values] of Object.entries(layer)) {
            merged[section] = { ...merged[section], ...values };
        }
    }

    return merged as SubtitleConfigOverrides;
}

export function resolveSubtitleConfig(
    overrides: SubtitleConfigOverrides = {},
): SubtitleConfig {
    return {
        canvas: {
            ...defaultSubtitleConfig.canvas,
            ...overrides.canvas,
        },
        typography: {
            ...defaultSubtitleConfig.typography,
            ...overrides.typography,
        },
        layout: {
            ...defaultSubtitleConfig.layout,
            ...overrides.layout,
        },
        colors: {
            ...defaultSubtitleConfig.colors,
            ...overrides.colors,
        },
        soundCues: {
            ...defaultSubtitleConfig.soundCues,
            ...overrides.soundCues,
        },
        glow: {
            ...defaultSubtitleConfig.glow,
            ...overrides.glow,
        },
        neon: {
            ...defaultSubtitleConfig.neon,
            ...overrides.neon,
        },
        animation: {
            ...defaultSubtitleConfig.animation,
            ...overrides.animation,
        },
        render: {
            ...defaultSubtitleConfig.render,
            ...overrides.render,
        },
    };
}
