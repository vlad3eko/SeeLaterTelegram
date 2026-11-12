export type WordTiming = {
    text: string;
    /** Seconds relative to the beginning of the input video. */
    start: number;
    /** Seconds relative to the beginning of the input video. */
    end: number;
    language?: string;
    /** Speaker id ('S1', 'S2', …) from Gemini diarization and/or the voice analysis. */
    speaker?: string;
    /** Set on words produced by translation: language the speaker really used. */
    sourceLanguage?: string;
};

/** Non-speech vocal / sound annotation emitted by Whisper, e.g. "КРИК" or "СМЕХ". */
export type SoundCue = {
    text: string;
    /** Seconds relative to the beginning of the input video. */
    start: number;
    /** Seconds relative to the beginning of the input video. */
    end: number;
};

export type WhisperTranscript = {
    words: WordTiming[];
    soundCues: SoundCue[];
};

/**
 * Neon surface of a highlighted word:
 * - `filled` — glossy filled neon (tinted core, saturated rim, sheen, glow);
 * - `tube`   — hollow neon tube (thin bright line over a dark tinted plate).
 */
export type NeonStyle = 'filled' | 'tube';

/** `mixed` alternates filled and tube runs deterministically (see config.neon). */
export type NeonStyleMode = 'mixed' | NeonStyle;

export type KeyPhrase = string | {
    text: string;
    color?: string;
    /** Forces the neon surface of this phrase; otherwise config.neon decides. */
    style?: NeonStyle;
};

export type SubtitleWord = WordTiming & {
    normalized: string;
    color: string;
    highlighted: boolean;
    /**
     * Neon surface for highlighted words. Set by a key phrase or resolved by
     * the ASS renderer from config.neon; ignored for white words.
     */
    neonStyle?: NeonStyle;
    /**
     * Earliest display time (seconds) from the row flow: the whole row
     * at once, ahead of the voice by animation.entryLeadMs. Written by
     * the ASS renderer; the spoken start/end stay untouched.
     */
    displayStart?: number;
};

export type SubtitleBlock = {
    index: number;
    words: SubtitleWord[];
    lines: SubtitleWord[][];
    start: number;
    end: number;
    displayEnd: number;
    fontScale?: number;
};

export type SubtitleConfig = {
    canvas: {
        baseWidth: number;
        baseHeight: number;
        centerXPercent: number;
        centerYPercent: number;
        safeMarginPercent: number;
    };
    typography: {
        fontName: string;
        fontSizeAtBase: number;
        minimumCapHeightPercentOfWidth: number;
        lineBaselineGapAtBase: number;
        /** Fixed upper-line baseline on a 1080x1920 canvas. */
        topLineBaselineAt1080: number;
        /** Fixed lower-line baseline on a 1080x1920 canvas. */
        bottomLineBaselineAt1080: number;
        bold: boolean;
        uppercase: boolean;
        letterSpacingAtBase: number;
        maxCharsPerLine: number;
        maxLines: number;
    };
    layout: {
        maxWordsPerBlock: number;
        maxBlockDurationSeconds: number;
        splitOnPauseSeconds: number;
        holdAfterLastWordSeconds: number;
        /** Two neighbouring one-row sentences share one block: row 1 + row 2, leaving together. */
        pairPhrases: boolean;
        /** Sentences are paired only when the pause between them is at most this long. */
        pairMaxGapSeconds: number;
        /** ... and when both together are spoken within this many seconds. */
        pairMaxSpanSeconds: number;
        /** Cut a block when the speaker changes, even without a pause. */
        splitOnSpeakerChange: boolean;
        /**
         * The same speaker pausing for up to this long (breath) inside an
         * unfinished sentence (no . ! ? … at the end) does not start a new block.
         */
        sameSpeakerContinueSeconds: number;
    };
    colors: {
        white: string;
        outline: string;
        palette: string[];
        autoHighlightLongestWordPerBlock: boolean;
        highlightStopWords: string[];
    };
    soundCues: {
        enabled: boolean;
        topPercent: number;
        fontSizeAtBase: number;
        color: string;
        alpha: number;
        outlineColor: string;
        outlineAlpha: number;
        outlineWidthAtBase: number;
        letterSpacingAtBase: number;
        minDurationSeconds: number;
        fadeInMs: number;
        fadeOutMs: number;
    };
    glow: {
        enabled: boolean;
        backingBlur: number;
        backingAlpha: number;
        /** ASS alpha for dark backing on bright movie regions (about 65% opacity). */
        backingBrightAlpha: number;
        /** Mean luma threshold [0..1] for selecting the stronger backing. */
        backingBrightnessThreshold: number;
        outerBlur: number;
        outerAlpha: number;
        innerBlur: number;
        innerAlpha: number;
        whiteOuterAlpha: number;
        whiteInnerAlpha: number;
        /** @deprecated Kept for override compatibility; superseded by config.neon. */
        whiteHotCoreWidthAtBase: number;
        /** @deprecated Kept for override compatibility; superseded by config.neon. */
        whiteHotCoreAlpha: number;
        /**
         * Legacy hard contour width. Still used as padding for background
         * luminance sampling; glyph contours are now set by config.neon.
         */
        outlineWidth: number;
    };
    /**
     * Neon materials (reference look). Widths and blurs are in px at the base
     * canvas height and are scaled with the video. Values named *Alpha use the
     * ASS convention: 0 = opaque, 255 = transparent.
     */
    neon: {
        /** `mixed` (reference rhythm), or force every neon run to one style. */
        styleMode: NeonStyleMode;
        /** In `mixed` mode every Nth neon run is a tube (0 disables tubes). */
        tubeEveryNthRun: number;
        /** Index of the first tube run inside each cycle of tubeEveryNthRun. */
        tubeRunOffset: number;
        /** Shrinks neon glyphs by their outside rim/line (0 = off, 1 = full). */
        outlineSizeCompensation: number;
        /**
         * Glyph em size (px at base canvas) for which the effect sizes below
         * are tuned. Effects scale with lineFontSize / designFontSizeAtBase,
         * so small or large captions keep the same proportions.
         */
        designFontSizeAtBase: number;

        // Filled (glossy) neon.
        /** White mixed into the settled body fill: a lit core, not flat paint. */
        fillCoreWhiteMix: number;
        /** Saturated rim around the filled glyph, px at base. */
        rimWidthAtBase: number;
        rimBlur: number;
        /** White mixed into the ignition flash colour. */
        igniteFlashWhiteMix: number;
        /** HSV value of the very first, unlit frame of a neon glyph. */
        igniteStartBrightness: number;
        /** Fraction of neonFillDurationMs at which the flash peaks. */
        igniteFlashAt: number;
        /**
         * Fraction of neonFillDurationMs by which tube lines and glows reach
         * full brightness. Lower = the word is readable sooner (the colour
         * settle continues afterwards).
         */
        igniteReadableAt: number;
        /** Spread added to the filled glow copies, px at base. */
        glowSpreadAtBase: number;
        /** Top-lit specular sheen on filled glyphs. */
        glossEnabled: boolean;
        /** ASS alpha of the brightest (top) sheen band. */
        glossAlpha: number;
        /** Number of clipped sheen bands; more bands = smoother gradient. */
        glossBands: number;
        /** Part of the cap height covered by the sheen, from the top. */
        glossCoverage: number;
        glossBlur: number;

        // Tube (hollow) neon.
        tubeLineWidthAtBase: number;
        tubeLineBlur: number;
        /** White mixed into the tube line (dark accents receive more). */
        tubeLineWhiteMix: number;
        /** Saturated halo directly around the line. */
        tubeHaloWidthAtBase: number;
        tubeHaloBlur: number;
        tubeHaloAlpha: number;
        /** Wide soft glow of the tube. */
        tubeGlowWidthAtBase: number;
        tubeGlowBlur: number;
        tubeGlowAlpha: number;

        // Plates (soft rounded boxes behind each word).
        plateEnabled: boolean;
        /** Horizontal / vertical padding as a fraction of the cap height. */
        platePadX: number;
        platePadY: number;
        tubePlatePadX: number;
        tubePlatePadY: number;
        /** Corner radius as a fraction of the plate height. */
        plateCornerRatio: number;
        /** Vertical plate offset as a fraction of the cap height (+ = down). */
        plateOffsetY: number;
        /** HSV value of the filled-neon plate tint. */
        filledPlateBrightness: number;
        filledPlateAlpha: number;
        /** HSV value of the tube plate tint (shows through hollow letters). */
        tubePlateBrightness: number;
        tubePlateAlpha: number;
        /** Neutral plate for white words; its alpha is glow.backingAlpha/backingBrightAlpha. */
        whitePlateColor: string;
        /** Neon plates become this much more opaque on bright backgrounds. */
        brightPlateAlphaBoost: number;
        /** Easing of the plate exit fade (< 1 = most of the fade happens early). */
        plateFadeAccel: number;

        // White words.
        /** Soft contact shadow replacing the former hard black stroke. */
        whiteOutlineWidthAtBase: number;
        whiteOutlineAlpha: number;
        whiteOutlineBlur: number;
        /** ASS alpha of the dark contour kept by white words during exit Phase B. */
        whiteExitContourAlpha: number;

        /** White mixed into the neon contour kept by exit Phase B. */
        exitContourWhiteMix: number;
    };
    animation: {
        enterMs: number;
        enterGhostMs: number;
        enterGhostAlpha: number;
        enterBlur: number;

        enterFlashMs: number;
        enterSettleMs: number;

        enterScaleDurationMs: number;
        enterPeakGlowMultiplier: number;
        enterEaseOutAccel: number;

        enterInitialColor: string;
        enterFlashColor: string;

        exitMs: number;
        exitStaggerMs: number;
        exitWindowMs: number;
        exitBlur: number;

        overlapMs: number;
        scaleOnEnter: boolean;
        enterScalePercent: number;

        blockScaleStartPercent: number;
        blockScaleEndPercent: number;
        blockScaleDurationMs: number;
        exitDimMs: number;
        exitRemainingOpacityPercent: number;

        // Дополнительное размытие отдельных исчезающих слов.
        lineExitDurationMs: number;
        lineExitBlur: number;

        // Legacy compatibility setting; actual row tracking is capped by measured safe width.
        lineExitLetterSpacing: number;

        // Постоянная скорость расширения строки.
        lineTrackingGrowthEmPerSec: number;
        lineTrackingMaxWidthRatio: number;

        // Индивидуальное исчезновение слов.
        wordExitDelayMs: number;
        wordExitStaggerMs: number;
        wordExitMinDurationMs: number;
        wordExitMaxDurationMs: number;
        wordExitDurationFactor: number;
        wordExitGhostAlpha: number;
        wordExitGhostDurationMs: number;
        wordExitEaseInAccel: number;
        glowEnterLeadMs: number;

        // Per-glyph left-to-right exit wave.
        exitWaveStepMs: number;
        exitPhaseADurationMs: number;
        exitPhaseBDurationMs: number;
        exitTriggerLeadMs: number;
        exitNoNextDelayMs: number;
        exitWordClearanceMs: number;
        exitGlyphBlurPx: number;
        exitGlyphShiftPx: number;
        exitBackingTailMs: number;
        neonFillDurationMs: number;
        /** Minimum gap between first appearances of any two words, in source-video frames. */
        entryWordMinGapFrames: number;

        // Row flow (see render/phrase-flow.ts).
        /**
         * 'words': every word appears just before it is spoken (reference
         * behaviour). 'row': a whole row appears entryLeadMs ahead of the voice.
         */
        entryMode: 'words' | 'row';
        /** Words mode: lead of the first word of a sentence, ms. */
        entryLeadStartMs: number;
        /** Words mode: lead of the last word of a sentence, ms. */
        entryLeadEndMs: number;
        /** Words mode: per-letter step (a few ms = the word appears as a whole). */
        entryWordLetterStepMs: number;
        /** Row mode: a row appears this long before its first word is spoken. */
        entryLeadMs: number;
        /** Letters of a row build up left to right at this step (33.3 ms = one 30 fps frame per letter). */
        entryLetterStepMs: number;
        /** The exit wave never starts earlier than this after the phrase's last word appeared. */
        phraseMinHoldMs: number;
        /**
         * When a new word may overlap an outgoing glyph at the same place.
         * 1 = as soon as the old glyph starts to fade (reference behaviour);
         * below 1 = once the old contour has faded to this opacity
         * (0.3 = the former strict rule, which delayed phrases).
         */
        exitCollisionMaxOpacity: number;
    };
    render: {
        videoCodec: string;
        preset: string;
        crf: number;
        audioCodec: 'copy' | 'aac';
        audioBitrate: string;
    };
};

export type SubtitleConfigOverrides = {
    [K in keyof SubtitleConfig]?: Partial<SubtitleConfig[K]>;
};

export type ProcessOptions = {
    cwd?: string;
    label?: string;
    timeoutMs?: number;
    maxStderrBytes?: number;
};

/** What the clip is about; helps the transcript check with names and topic. */
export type SubtitleContext = {
    title?: string;
    overview?: string;
    /** Names of characters or actors, when known. */
    names?: string[];
};

export type WhisperOptions = {
    inputPath: string;
    modelPath: string;
    outputPath: string;
    ffmpegPath?: string;
    language?: string;
    queueSeconds?: number;
    useGpu?: boolean;
    maxLen?: number;
    timeoutMs?: number;
    context?: SubtitleContext;
    /**
     * Words Gemini already transcribed for this clip (time from the clip start), e.g.
     * the clip-fragment step's transcript of the whole source. The Gemini pipeline then
     * skips its own Gemini request; the Whisper timing, checks and translation still run.
     */
    preTranscribed?: WordTiming[];
};

export type RenderSubtitlesOptions = {
    inputPath: string;
    assPath: string;
    outputPath: string;
    ffmpegPath?: string;
    ffprobePath?: string;
    fontsDirectory?: string;
    config: SubtitleConfig;
};

export type GenerateInstagramSubtitlesOptions = {
    inputVideoPath: string;
    outputVideoPath: string;
    workDirectory: string;
    modelPath?: string;
    ffmpegPath?: string;
    ffprobePath?: string;
    fontsDirectory?: string;
    language?: string;
    queueSeconds?: number;
    useGpu?: boolean;
    keyPhrases?: KeyPhrase[];
    config?: SubtitleConfigOverrides;
    /** Retain word timings, blocks and ASS files for diagnosis. Defaults to true. */
    keepArtifacts?: boolean;
};

export type GenerateInstagramSubtitlesResult = {
    outputVideoPath: string;
    assPath?: string;
    wordsPath?: string;
    blocksPath?: string;
    wordCount: number;
    blockCount: number;
    durationSeconds: number;
};

export type GenerateInstagramSubtitleTrackOptions = {
    inputVideoPath: string;
    /** A unique parent temp directory, e.g. /tmp/instagram/<reel-id>_subtitles. */
    workDirectory: string;
    /** Optional unique run ID; a UUID is generated when omitted. */
    runId?: string;
    modelPath?: string;
    /** Must point to FFmpeg compiled with --enable-whisper. */
    whisperFfmpegPath?: string;
    /** Same Montserrat ExtraBold TTF used by FFmpeg, for exact glyph positioning. */
    fontFilePath?: string;
    ffprobePath?: string;
    language?: string;
    queueSeconds?: number;
    useGpu?: boolean;
    keyPhrases?: KeyPhrase[];
    config?: SubtitleConfigOverrides;
    keepDebugArtifacts?: boolean;
    timeoutMs?: number;
    /** Title and overview of the film or series, for the transcript check. */
    context?: SubtitleContext;
    /** See WhisperOptions.preTranscribed. */
    preTranscribed?: WordTiming[];
};

export type GenerateInstagramSubtitleTrackResult = {
    /** Pass this path to decorateInstagramVideo({ subtitleAssPath }). */
    assPath: string;
    workDirectory: string;
    wordsPath?: string;
    blocksPath?: string;
    rawTranscriptionPath?: string;
    wordCount: number;
    blockCount: number;
    durationSeconds: number;
    soundCueCount: number;
    width: number;
    height: number;
    /** Minimum video tail required after the source end to show the final no-next-phrase exit wave. */
    requiredVideoTailSeconds: number;
    wordOrderPath?: string;
    /** Time windows of the phrases on screen; the "save" call picks a quiet spot by them. */
    speechWindows: Array<{ start: number; end: number }>;
};
