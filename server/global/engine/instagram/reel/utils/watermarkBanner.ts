import {promisify} from 'node:util'
import {execFile} from 'node:child_process'
import ffmpegPath from 'ffmpeg-static'

const execFileAsync = promisify(execFile)

/**
 * Плашка-ватермарка канала в левом верхнем углу (запрос владельца 11.11, пример:
 * красная «THE BOXOFFICE NETWORK»). Плашка прижата к левому краю картинки, лежит
 * в верхней трети и иногда «вытягивается» вправо, заходя в центральный квадрат.
 *
 * Признаки плашки в одном кадре (все сразу, чтобы не путать со сценой):
 * - ряды, которые от левого края на заметную длину заполнены ОДНИМ насыщенным
 *   цветом (белые буквы внутри плашки допустимы: доля цвета от 55%);
 * - такие ряды идут сплошной полосой высотой 2,5–25% кадра (разрывы до 3% внутри
 *   полосы допустимы: строки букв), под полосой цвет кончается; полоса может касаться
 *   верхнего края, если срез чёрных полос прошёл через плашку;
 * - длина цветного участка в рядах полосы почти одинаковая (ровный правый край);
 * - полоса не во всю ширину (не больше 75%) и не короче 6% ширины.
 *
 * Если плашка нашлась хотя бы в одном кадре фрагмента, кадр обрезается ниже её
 * нижней границы целиком: и «вытянутая» плашка в квадрат не попадёт.
 */

export type WatermarkBanner = {
    /** Нижняя граница плашки, доля высоты анализируемой картинки (0–1). */
    bottomShare: number
    /** Правая граница плашки, доля ширины (0–1), наибольшая по кадрам. */
    rightShare: number
    /** В скольких кадрах плашка найдена. */
    frames: number
    /** Сколько кадров проверено. */
    sampledFrames: number
}

type RgbFrames = {
    width: number
    height: number
    frames: Buffer[]
}

/** Ширина кадров для поиска плашки: плашка крупная, точности хватает с запасом. */
const BANNER_ANALYSIS_WIDTH = 480
/** Сколько кадров по фрагменту: плашка видна не всё время. */
export const BANNER_SAMPLE_COUNT = 24

const SEARCH_HEIGHT_SHARE = 0.35
const MIN_RUN_SHARE = 0.06
const MAX_RUN_SHARE = 0.75
const MIN_COLOR_DENSITY = 0.55
const MIN_BASE_DENSITY = 0.25

/** Белые или почти белые буквы надписи на плашке. */
const isLettering = (r: number, g: number, b: number) =>
    Math.min(r, g, b) >= 170 && Math.max(r, g, b) - Math.min(r, g, b) <= 60
const MIN_BAND_SHARE = 0.025
const MAX_GAP_SHARE = 0.03
const MAX_BAND_SHARE = 0.25
/** Ровный правый край: самый длинный ряд полосы не длиннее самого короткого в 1,35 раза. */
const MAX_RUN_SPREAD = 1.35
const HUE_TOLERANCE = 22
const PARALLEL = 3

/** REEL_WATERMARK_CHECK=off отключает поиск плашки. */
export const watermarkCheckEnabled = () =>
    (process.env.REEL_WATERMARK_CHECK ?? '').trim().toLowerCase() !== 'off'

/** Цветной насыщенный пиксель: оттенок 0–360 или -1 (серый, белый, чёрный, тусклый). */
const saturatedHue = (r: number, g: number, b: number): number => {
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const delta = max - min

    if (max < 90 || delta < 0.5 * max) return -1

    let hue: number
    if (max === r) hue = ((g - b) / delta) % 6
    else if (max === g) hue = (b - r) / delta + 2
    else hue = (r - g) / delta + 4

    hue *= 60
    return hue < 0 ? hue + 360 : hue
}

const hueDistance = (a: number, b: number) => {
    const d = Math.abs(a - b) % 360
    return d > 180 ? 360 - d : d
}

/**
 * Длина участка ряда от левого края, где доля пикселей опорного цвета не ниже
 * MIN_COLOR_DENSITY, и сам опорный оттенок. 0 — ряд не начинается с цвета.
 */
const measureRow = (frame: Buffer, width: number, row: number): {run: number, hue: number} => {
    const offset = row * width * 3
    const hueAt = (x: number) => saturatedHue(frame[offset + x * 3]!, frame[offset + x * 3 + 1]!, frame[offset + x * 3 + 2]!)

    // Опорный цвет — у самого края (первые 3 пикселя, первый цветной).
    let reference = -1
    for (let x = 0; x < 3 && reference < 0; x++) reference = hueAt(x)
    if (reference < 0) return {run: 0, hue: -1}

    const maxRun = Math.floor(width * MAX_RUN_SHARE) + 1
    let colored = 0
    let lettering = 0
    let best = 0

    for (let x = 0; x < width && x <= maxRun * 1.5; x++) {
        const o = offset + x * 3
        const hue = hueAt(x)

        if (hue >= 0 && hueDistance(hue, reference) <= HUE_TOLERANCE) {
            colored++
            // Ряд через надпись: цвет плашки и белые буквы вместе не меньше MIN_COLOR_DENSITY,
            // самого цвета не меньше MIN_BASE_DENSITY (на красной плашке с белым текстом
            // строки букв дают около 40% красного и 40% белого). Конец участка ставим
            // только на цветном пикселе: белое за плашкой её не удлиняет.
            const length = x + 1
            if (
                (colored + lettering) / length >= MIN_COLOR_DENSITY &&
                colored / length >= MIN_BASE_DENSITY
            ) {
                best = length
            }
        } else if (isLettering(frame[o]!, frame[o + 1]!, frame[o + 2]!)) {
            lettering++
        }
    }

    return {run: best, hue: reference}
}

/** Плашка в одном кадре: нижняя и правая граница в пикселях кадра анализа, или null. */
export const findBannerInFrame = (
    frame: Buffer,
    width: number,
    height: number
): {bottom: number, right: number} | null => {
    const searchRows = Math.floor(height * SEARCH_HEIGHT_SHARE)
    const minRun = Math.ceil(width * MIN_RUN_SHARE)
    const maxRun = Math.floor(width * MAX_RUN_SHARE)

    const rows = Array.from({length: searchRows + 1}, (_, row) => measureRow(frame, width, row))
    const qualifies = (row: number) => {
        const {run} = rows[row] ?? {run: 0}
        return run >= minRun && run <= maxRun
    }

    // Строки надписи после уменьшения кадра бывают «грязными» и проходят не все:
    // разрыв до MAX_GAP_SHARE высоты внутри полосы допустим.
    const maxGap = Math.max(2, Math.ceil(height * MAX_GAP_SHARE))

    for (let start = 0; start < searchRows; start++) {
        if (!qualifies(start)) continue

        let end = start
        for (let next = end + 1; next < searchRows && next - end <= maxGap + 1; next++) {
            if (qualifies(next)) end = next
        }

        const bandHeight = end - start + 1
        const above = start > 0 ? qualifies(start - 1) : false
        const below = end + 1 <= searchRows ? qualifies(end + 1) : false

        const band = rows.slice(start, end + 1).filter(r => r.run >= minRun)
        const runs = band.map(r => r.run).sort((a, b) => a - b)
        // Края полосы сглажены: берём внутренние 80% рядов.
        const inner = runs.slice(Math.floor(runs.length * 0.1), Math.ceil(runs.length * 0.9))
        const spread = inner.length ? inner[inner.length - 1]! / Math.max(1, inner[0]!) : Infinity
        const hues = band.map(r => r.hue)
        const sameHue = hues.every(h => hueDistance(h, hues[0]!) <= HUE_TOLERANCE)

        if (
            bandHeight >= height * MIN_BAND_SHARE &&
            bandHeight <= height * MAX_BAND_SHARE &&
            // Полоса может касаться верхнего края: срез чёрных полос (тёмная сцена над
            // плашкой) мог пройти через её середину, и остаток всё равно надо убрать.
            !above && !below &&
            spread <= MAX_RUN_SPREAD &&
            sameHue
        ) {
            return {bottom: end + 1, right: runs[runs.length - 1]!}
        }

        start = end
    }

    return null
}

/**
 * Цветные кадры картинки (rect — область исходника без чёрных полос; без него
 * берётся весь кадр), уменьшенные до BANNER_ANALYSIS_WIDTH по ширине.
 */
const sampleRgbFrames = async (
    videoPath: string,
    times: number[],
    rect: {x: number, y: number, w: number, h: number},
    accurateSeek: boolean
): Promise<RgbFrames> => {
    if (!ffmpegPath) {
        throw new Error('[REEL WATERMARK] ffmpeg-static binary not found')
    }
    const binary = ffmpegPath

    const width = Math.min(BANNER_ANALYSIS_WIDTH, rect.w) & ~1
    const height = Math.max(2, Math.round(rect.h * width / rect.w) & ~1)
    const frameBytes = width * height * 3
    const filter = `crop=${rect.w}:${rect.h}:${rect.x}:${rect.y},scale=${width}:${height}:flags=area,format=rgb24`

    const results: Array<Buffer | null> = times.map(() => null)
    let next = 0

    const worker = async () => {
        while (next < times.length) {
            const index = next++
            try {
                const {stdout} = await execFileAsync(
                    binary,
                    [
                        '-hide_banner', '-loglevel', 'error', '-nostdin',
                        ...(accurateSeek ? [] : ['-noaccurate_seek']),
                        '-ss', times[index]!.toFixed(3),
                        '-i', videoPath,
                        '-an', '-sn', '-frames:v', '1',
                        '-vf', filter,
                        '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'
                    ],
                    {encoding: 'buffer', timeout: 30_000, maxBuffer: frameBytes + 1024 * 1024}
                )
                if (stdout.length === frameBytes) results[index] = stdout
            } catch {
                // Кадр не получился: пропускаем.
            }
        }
    }

    await Promise.all(Array.from({length: Math.min(PARALLEL, times.length)}, worker))

    return {width, height, frames: results.filter((f): f is Buffer => f !== null)}
}

/**
 * Ищет плашку в области `rect` видео в моменты `times`. null — плашки нет
 * (или кадры не получены). Сбой ffmpeg пробрасывается: вызывающий решает, падать ли.
 */
export const detectWatermarkBanner = async (
    videoPath: string,
    times: number[],
    rect: {x: number, y: number, w: number, h: number},
    accurateSeek = false
): Promise<WatermarkBanner | null> => {
    const sampled = await sampleRgbFrames(videoPath, times, rect, accurateSeek)

    let bottom = 0
    let right = 0
    let frames = 0

    for (const frame of sampled.frames) {
        const banner = findBannerInFrame(frame, sampled.width, sampled.height)
        if (banner) {
            frames++
            bottom = Math.max(bottom, banner.bottom)
            right = Math.max(right, banner.right)
        }
    }

    if (!frames) return null

    return {
        bottomShare: bottom / sampled.height,
        rightShare: right / sampled.width,
        frames,
        sampledFrames: sampled.frames.length
    }
}
