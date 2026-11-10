import type {
    NeonStyle,
    SubtitleConfig,
    SubtitleWord,
} from '../types.js';

/**
 * Neon "material" model used by the ASS renderer.
 *
 * The reference captions use three distinct surfaces:
 *
 * - `white`  — clean white ExtraBold letters on a soft neutral plate,
 *              with only a faint contact shadow instead of a hard black stroke;
 * - `filled` — glossy neon: a slightly white-tinted core, a saturated rim,
 *              a top-lit specular sheen, a two-stage glow and a plate tinted
 *              with the same hue;
 * - `tube`   — hollow neon tubes: a thin, almost white line in the accent hue,
 *              a saturated halo around it and a dark, strongly tinted plate
 *              that shows through the hollow letters.
 *
 * This module is pure (no I/O, no ASS formatting). It only resolves which
 * material a word uses and derives every colour of that material from the
 * single accent colour selected by the layout builder.
 */

export type WordMaterialKind = 'white' | NeonStyle;

export type NeonPalette = {
    /** Accent colour exactly as chosen by the layout builder. */
    base: string;
    /** Settled body fill of a filled neon glyph (accent with a little white). */
    core: string;
    /** Ignition flash colour: the over-exposed "white-hot" moment. */
    hot: string;
    /** First-frame colour: the tube/letter before it is fully lit. */
    dim: string;
    /** Bright tube line (accent strongly mixed with white). */
    line: string;
    /** Dark, saturated plate colour behind the word. */
    plate: string;
    /** Contour colour kept by the exit Phase B. */
    exitContour: string;
};

export type ResolvedWordMaterial = {
    kind: WordMaterialKind;
    /** Undefined for white words. */
    palette?: NeonPalette;
    /** Glyph font size after optional outline-size compensation. */
    fontSizePx: number;
};

type Rgb = [number, number, number];

/** Thinnest tube line / rim that still reads as a line after libass AA. */
export const MIN_TUBE_LINE_PX = 0.8;
export const MIN_RIM_PX = 0.5;

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

export function parseHexColor(hex: string): Rgb {
    const value = hex.trim().replace('#', '');

    if (!/^[0-9a-f]{6}$/iu.test(value)) {
        throw new Error(`[SUBTITLE NEON] Invalid color: ${hex}`);
    }

    return [0, 2, 4].map(offset =>
        Number.parseInt(value.slice(offset, offset + 2), 16),
    ) as Rgb;
}

function toHex(rgb: Rgb): string {
    return `#${rgb.map(channel =>
        clamp(Math.round(channel), 0, 255).toString(16).padStart(2, '0'),
    ).join('')}`.toUpperCase();
}

/** Linear mix of two sRGB colours. amount=0 → a, amount=1 → b. */
export function mixHexColors(a: string, b: string, amount: number): string {
    const left = parseHexColor(a);
    const right = parseHexColor(b);
    const t = clamp(amount, 0, 1);

    return toHex([
        left[0] + (right[0] - left[0]) * t,
        left[1] + (right[1] - left[1]) * t,
        left[2] + (right[2] - left[2]) * t,
    ]);
}

/**
 * Keeps hue and saturation and sets the HSV value (brightness) to `value`.
 * Used for the tinted plates: #2BFF5A at 0.36 becomes a deep neon green.
 */
export function withHsvValue(hex: string, value: number): string {
    const rgb = parseHexColor(hex);
    const max = Math.max(...rgb, 1);
    const factor = clamp(value, 0, 1) * 255 / max;

    return toHex([rgb[0] * factor, rgb[1] * factor, rgb[2] * factor]);
}

/** WCAG relative luminance in [0..1]. */
export function relativeLuminance(hex: string): number {
    const [r, g, b] = parseHexColor(hex).map(channel => {
        const c = channel / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    }) as Rgb;

    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Derives every colour of a neon material from one accent colour.
 * Dark accents (blue, violet, red) receive more white in their tube line and
 * core so that they read as bright as yellow or green at the same size;
 * this replaces the former fixed COOL_NEON_COLORS list.
 */
export function buildNeonPalette(
    accent: string,
    config: SubtitleConfig,
): NeonPalette {
    const neon = config.neon;
    const base = toHex(parseHexColor(accent));
    const luminance = relativeLuminance(base);
    // 0 for a very bright accent (yellow ≈ 0.85), up to ~0.35 for blue/violet.
    const darkAccentBoost = clamp((0.62 - luminance) * 0.55, 0, 0.35);

    return {
        base,
        core: mixHexColors(
            base,
            '#FFFFFF',
            clamp(neon.fillCoreWhiteMix + darkAccentBoost * 0.25, 0, 0.9),
        ),
        hot: mixHexColors(base, '#FFFFFF', neon.igniteFlashWhiteMix),
        dim: withHsvValue(base, neon.igniteStartBrightness),
        line: mixHexColors(
            base,
            '#FFFFFF',
            clamp(neon.tubeLineWhiteMix + darkAccentBoost, 0, 0.9),
        ),
        plate: withHsvValue(base, neon.filledPlateBrightness),
        exitContour: mixHexColors(base, '#FFFFFF', neon.exitContourWhiteMix),
    };
}

/** Plate colour depends on the material, not only on the accent. */
export function getPlateColor(
    material: ResolvedWordMaterial,
    config: SubtitleConfig,
): string {
    if (material.kind === 'white' || !material.palette) {
        return config.neon.whitePlateColor;
    }

    return material.kind === 'tube'
        ? withHsvValue(material.palette.base, config.neon.tubePlateBrightness)
        : material.palette.plate;
}

export function getWordMaterialKind(word: SubtitleWord): WordMaterialKind {
    if (!word.highlighted) return 'white';
    return word.neonStyle ?? 'filled';
}

/**
 * Assigns `neonStyle` to every highlighted word that does not already have
 * an explicit style (from a key phrase). A "run" is a sequence of adjacent
 * highlighted words with the same colour on one row; every word of a run
 * shares one style, so a phrase never mixes tube and filled letters.
 *
 * The assignment is deterministic: the same transcript always produces the
 * same styles, which keeps previews and the final render identical.
 *
 * Returns the number of runs rendered as tubes.
 */
export function assignNeonStyles(
    blocksLines: SubtitleWord[][][],
    config: SubtitleConfig,
): number {
    const neon = config.neon;
    let runIndex = 0;
    let tubeRuns = 0;

    const autoStyleForRun = (index: number): NeonStyle => {
        if (neon.styleMode !== 'mixed') return neon.styleMode;
        const every = Math.floor(neon.tubeEveryNthRun);
        if (!(every > 0)) return 'filled';
        const offset = ((Math.floor(neon.tubeRunOffset) % every) + every) % every;
        return index % every === offset ? 'tube' : 'filled';
    };

    for (const lines of blocksLines) {
        for (const line of lines) {
            let wordIndex = 0;

            while (wordIndex < line.length) {
                const first = line[wordIndex];

                if (!first?.highlighted) {
                    wordIndex += 1;
                    continue;
                }

                const run: SubtitleWord[] = [first];
                let next = wordIndex + 1;

                while (next < line.length) {
                    const candidate = line[next];
                    if (
                        !candidate?.highlighted ||
                        candidate.color.toUpperCase() !== first.color.toUpperCase()
                    ) {
                        break;
                    }
                    run.push(candidate);
                    next += 1;
                }

                // An explicit key-phrase style wins for the whole run.
                const explicit = run.find(word => word.neonStyle)?.neonStyle;
                const style = explicit ?? autoStyleForRun(runIndex);

                for (const word of run) {
                    word.neonStyle = style;
                }

                if (style === 'tube') tubeRuns += 1;
                runIndex += 1;
                wordIndex = next;
            }
        }
    }

    return tubeRuns;
}

/**
 * Resolves the material of a word on a row rendered at `lineFontSizePx`.
 *
 * Neon rims and tube lines are drawn by libass *outside* the glyph outline,
 * so they make neon letters look heavier and taller than white letters.
 * `outlineSizeCompensation` shrinks the glyph by that amount (0 = off,
 * 1 = full) so all words keep the same visual cap height. Glyph anchors are
 * visual centres, so positions and tracking are unaffected.
 */
export function resolveWordMaterial(
    word: SubtitleWord,
    lineFontSizePx: number,
    lineCapHeightPx: number,
    effectScale: number,
    config: SubtitleConfig,
): ResolvedWordMaterial {
    const kind = getWordMaterialKind(word);

    if (kind === 'white') {
        return { kind, fontSizePx: lineFontSizePx };
    }

    const outlinePx = kind === 'tube'
        ? Math.max(MIN_TUBE_LINE_PX, config.neon.tubeLineWidthAtBase * effectScale)
        : Math.max(MIN_RIM_PX, config.neon.rimWidthAtBase * effectScale);
    const compensation = clamp(config.neon.outlineSizeCompensation, 0, 1);
    const shrink = lineCapHeightPx > 0
        ? clamp(1 - (2 * outlinePx * compensation) / lineCapHeightPx, 0.8, 1)
        : 1;

    return {
        kind,
        palette: buildNeonPalette(word.color, config),
        fontSizePx: lineFontSizePx * shrink,
    };
}
