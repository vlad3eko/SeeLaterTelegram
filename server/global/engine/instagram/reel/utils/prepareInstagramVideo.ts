import {promisify} from 'node:util'
import {execFile} from 'node:child_process'
import {stat} from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import ffmpegPath from 'ffmpeg-static'
import {createHash, randomUUID} from 'node:crypto'
import {getX264Args} from '#server/global/engine/instagram/reel/utils/encodeSettings'
import {buildEnhanceFilters} from '#server/global/engine/instagram/reel/utils/enhanceSettings'
import {
    BANNER_SAMPLE_COUNT,
    detectWatermarkBanner,
    watermarkCheckEnabled,
    type WatermarkBanner
} from '#server/global/engine/instagram/reel/utils/watermarkBanner'
import {
    type FaceTrack,
    trackMainFace,
    writeTrackCommands
} from '#server/global/engine/instagram/reel/tracking/faceTrack'
import {unlink} from 'node:fs/promises'

const execFileAsync = promisify(execFile)

/**
 * Clean и финальный ролик квадратные: 1080×1080 (решение владельца 11.11).
 * Прежний макет был 1080×1920: видео 1080×932 поверх размытого фона.
 */
export const REEL_SIZE = 1080

/** Папка для служебных файлов оформления (fontconfig). */
export const reelAssetDirectory = path.join(os.tmpdir(), 'kinomanov-reel-template')

const clamp = (value: number, min: number, max: number) =>
    Math.max(min, Math.min(max, value))

export type ReelSegment = {
    totalDurationSeconds: number
    startSeconds: number
    durationSeconds: number
    endSeconds: number
}

export const getInputVideoDuration = async (inputPath: string): Promise<number> => {
    try {
        const {stdout} = await execFileAsync(
            process.env.FFPROBE_PATH || 'ffprobe',
            [
                '-v', 'error',
                '-show_entries', 'format=duration',
                '-of', 'default=noprint_wrappers=1:nokey=1',
                inputPath
            ],
            {
                timeout: 10_000,
                maxBuffer: 1024 * 1024
            }
        )

        const duration = Number(stdout.trim())
        if (Number.isFinite(duration) && duration > 0) {
            return duration
        }
    } catch (error: any) {
        console.log('[REEL DURATION] ffprobe unavailable or failed; using ffmpeg probe', {
            code: error?.code,
            message: error?.message
        })
    }

    if (!ffmpegPath) {
        throw new Error('[REEL DURATION] ffmpeg-static binary not found')
    }

    let probeOutput = ''
    try {
        await execFileAsync(
            ffmpegPath,
            ['-hide_banner', '-i', inputPath],
            {
                timeout: 10_000,
                maxBuffer: 2 * 1024 * 1024
            }
        )
    } catch (error: any) {
        probeOutput = String(error?.stderr || '')
    }

    const match = probeOutput.match(/Duration:\s*(\d+):(\d+):([\d.]+)/)
    if (!match) {
        throw new Error(`[REEL DURATION] Could not determine source duration: ${inputPath}`)
    }

    const duration = Number(match[1]) * 3600
        + Number(match[2]) * 60
        + Number(match[3])

    if (!Number.isFinite(duration) || duration <= 0) {
        throw new Error(`[REEL DURATION] Invalid source duration: ${inputPath}`)
    }

    return duration
}

/**
 * Положения начала фрагмента для вариантов «Пересобрать»: первым идёт прежнее (base),
 * затем по очереди позже и раньше него с шагом в половину фрагмента (не меньше 5 с),
 * в пределах [minStart, maxStart]. Положения ближе 1 с друг к другу не повторяются.
 */
export const segmentVariantStarts = (
    baseStart: number,
    minStart: number,
    maxStart: number,
    durationSeconds: number
): number[] => {
    const step = Math.max(5, durationSeconds / 2)
    const starts = [baseStart]
    const isNew = (value: number) => starts.every(existing => Math.abs(existing - value) >= 1)

    for (let k = 1; k <= 1000; k++) {
        const later = baseStart + k * step
        const earlier = baseStart - k * step
        const laterFits = later <= maxStart
        const earlierFits = earlier >= minStart

        if (!laterFits && !earlierFits) {
            // Ни одно новое положение целиком не помещается: добавляем края диапазона,
            // если они ещё не взяты, и заканчиваем.
            for (const edge of [maxStart, minStart]) {
                if (isNew(edge)) starts.push(edge)
            }
            break
        }

        if (laterFits && isNew(later)) starts.push(later)
        if (earlierFits && isNew(earlier)) starts.push(earlier)
    }

    return starts
}

/**
 * Selects the most useful middle section while reserving the trailer ending.
 * Long trailers: 40s, usually starting around midpoint - 10s.
 * 60-70s trailers: use the maximum duration that leaves 18s intro + 12s ending.
 * Short teasers: target 30s where possible, while leaving 20% (max 12s) at the end.
 *
 * `variant` (кнопка «Пересобрать» при ручной проверке clean): 0 даёт прежний фрагмент,
 * следующие номера сдвигают окно той же длины внутри того же допустимого диапазона
 * шагами по половине фрагмента, по очереди позже и раньше середины. Когда различных
 * положений больше нет, варианты идут по кругу.
 */
export const calculateReelSegment = (totalDurationSeconds: number, variant: number = 0): ReelSegment => {
    if (!Number.isFinite(totalDurationSeconds) || totalDurationSeconds <= 0) {
        throw new Error(`[REEL SEGMENT] Invalid duration: ${totalDurationSeconds}`)
    }

    const total = totalDurationSeconds
    const endGuard = total >= 60
        ? 12
        : Math.min(12, Math.max(2, total * 0.2))

    let durationSeconds: number
    let preferredMinimumStart = 0

    if (total >= 70) {
        durationSeconds = 40
        preferredMinimumStart = 18
    } else if (total >= 60) {
        durationSeconds = Math.min(40, total - 30)
        preferredMinimumStart = 18
    } else if (total >= 37.5) {
        durationSeconds = Math.min(30, total - endGuard)
    } else {
        durationSeconds = total - endGuard
    }

    durationSeconds = Math.max(1, Math.min(total, durationSeconds))

    const maxStart = Math.max(0, total - endGuard - durationSeconds)
    const minStart = Math.min(preferredMinimumStart, maxStart)
    const targetStart = total / 2 - 10
    const baseStart = clamp(targetStart, minStart, maxStart)
    const starts = segmentVariantStarts(baseStart, minStart, maxStart, durationSeconds)
    const variantIndex = Number.isFinite(variant) ? Math.max(0, Math.floor(variant)) : 0
    const startSeconds = starts[variantIndex % starts.length] ?? baseStart
    const endSeconds = Math.min(total, startSeconds + durationSeconds)

    return {
        totalDurationSeconds: total,
        startSeconds: Number(startSeconds.toFixed(3)),
        durationSeconds: Number((endSeconds - startSeconds).toFixed(3)),
        endSeconds: Number(endSeconds.toFixed(3))
    }
}


export type VideoDimensions = {
    width: number
    height: number
}

/**
 * Размер первого видеопотока. Сначала ffprobe, затем разбор вывода ffmpeg:
 * ffprobe в рабочем окружении может отсутствовать.
 */
export const probeVideoDimensions = async (inputPath: string): Promise<VideoDimensions> => {
    try {
        const {stdout} = await execFileAsync(
            process.env.FFPROBE_PATH || 'ffprobe',
            [
                '-v', 'error',
                '-select_streams', 'v:0',
                '-show_entries', 'stream=width,height',
                '-of', 'csv=p=0:s=x',
                inputPath
            ],
            {
                timeout: 10_000,
                maxBuffer: 1024 * 1024
            }
        )

        const match = stdout.trim().match(/^(\d+)x(\d+)/)
        if (match) {
            return {width: Number(match[1]), height: Number(match[2])}
        }
    } catch (error: any) {
        if (error?.code !== 'ENOENT') {
            console.log('[REEL DIMENSIONS] ffprobe failed; using ffmpeg probe', {
                message: error?.message
            })
        }
    }

    if (!ffmpegPath) {
        throw new Error('[REEL DIMENSIONS] ffmpeg-static binary not found')
    }

    let probeOutput = ''
    try {
        await execFileAsync(
            ffmpegPath,
            ['-hide_banner', '-i', inputPath],
            {
                timeout: 10_000,
                maxBuffer: 2 * 1024 * 1024
            }
        )
    } catch (error: any) {
        probeOutput = String(error?.stderr || '')
    }

    const match = probeOutput.match(/Video:[^\n]*?[,\s](\d{2,5})x(\d{2,5})[,\s[]/)
    if (!match) {
        throw new Error(`[REEL DIMENSIONS] Could not determine video size: ${inputPath}`)
    }

    return {width: Number(match[1]), height: Number(match[2])}
}

export type FrameRate = {
    /** Рациональная запись для `-r` и lavfi: «24000/1001», «25», «30». */
    rate: string
    fps: number
}

const DEFAULT_OUTPUT_FPS: FrameRate = {rate: '30', fps: 30}

/** Минимальная частота, которую принимает Instagram Reels, с запасом. */
const MIN_REEL_FPS = 23
const MAX_REEL_FPS = 31

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))

const toFrameRate = (numerator: number, denominator: number): FrameRate | undefined => {
    if (
        !Number.isFinite(numerator) || !Number.isFinite(denominator) ||
        numerator <= 0 || denominator <= 0
    ) {
        return undefined
    }

    const divisor = gcd(Math.round(numerator), Math.round(denominator)) || 1
    const num = Math.round(numerator) / divisor
    const den = Math.round(denominator) / divisor

    return {
        rate: den === 1 ? String(num) : `${num}/${den}`,
        fps: num / den
    }
}

/** «24000/1001», «25/1» или «29.97» в FrameRate. Нули («0/0») и мусор дают undefined. */
export const parseFrameRate = (value: string | undefined): FrameRate | undefined => {
    const text = String(value ?? '').trim()
    const fraction = text.match(/^(\d+)\s*\/\s*(\d+)$/)
    if (fraction) {
        return toFrameRate(Number(fraction[1]), Number(fraction[2]))
    }

    const decimal = Number(text)
    if (!Number.isFinite(decimal) || decimal <= 0) {
        return undefined
    }

    // Десятичную запись возвращаем к стандартным дробям NTSC, иначе 23.976 превратится
    // в 23976/1000 и «уплывёт» относительно 24000/1001.
    for (const [nominal, den] of [[24, 1001], [30, 1001], [60, 1001]] as const) {
        const ntsc = (nominal * 1000) / den
        if (Math.abs(decimal - ntsc) < 0.01) {
            return toFrameRate(nominal * 1000, den)
        }
    }

    return toFrameRate(Math.round(decimal * 1000), 1000)
}

/**
 * Частота выходного ролика. По умолчанию родная частота исходника: 24 к/с остаются 24,
 * а не растягиваются до 30 дублированием кадров через один (это даёт заметное
 * подёргивание на панорамах). Что выше 31 к/с (50, 60) делится пополам. Что ниже 23 или
 * не определилось, приводится к 30: Instagram требует не меньше 23 к/с.
 * REEL_OUTPUT_FPS=30 (или другое число) возвращает фиксированную частоту.
 */
export const resolveOutputFrameRate = (
    source: FrameRate | undefined,
    override: string | undefined = process.env.REEL_OUTPUT_FPS
): FrameRate => {
    const forced = String(override ?? '').trim().toLowerCase()
    if (forced && forced !== 'native') {
        return parseFrameRate(forced) ?? DEFAULT_OUTPUT_FPS
    }

    if (!source) {
        return DEFAULT_OUTPUT_FPS
    }

    let fps = source.fps
    let [numerator, denominator] = (source.rate.includes('/')
        ? source.rate.split('/').map(Number)
        : [Number(source.rate), 1]) as [number, number]

    for (let halving = 0; fps > MAX_REEL_FPS && halving < 3; halving++) {
        denominator *= 2
        fps = numerator / denominator
    }

    if (fps < MIN_REEL_FPS || fps > MAX_REEL_FPS) {
        return DEFAULT_OUTPUT_FPS
    }

    return toFrameRate(numerator, denominator) ?? DEFAULT_OUTPUT_FPS
}

/**
 * Частота кадров первого видеопотока: avg_frame_rate, при нуле r_frame_rate. Сначала ffprobe,
 * затем разбор вывода ffmpeg. Не бросает исключений: без частоты работаем на 30 к/с.
 */
export const probeVideoFrameRate = async (inputPath: string): Promise<FrameRate | undefined> => {
    try {
        const {stdout} = await execFileAsync(
            process.env.FFPROBE_PATH || 'ffprobe',
            [
                '-v', 'error',
                '-select_streams', 'v:0',
                '-show_entries', 'stream=avg_frame_rate,r_frame_rate',
                '-of', 'csv=p=0',
                inputPath
            ],
            {
                timeout: 10_000,
                maxBuffer: 1024 * 1024
            }
        )

        for (const part of stdout.trim().split(/[,\s]+/)) {
            const parsed = parseFrameRate(part)
            if (parsed) {
                return parsed
            }
        }
    } catch (error: any) {
        if (error?.code !== 'ENOENT') {
            console.log('[REEL FPS] ffprobe failed; using ffmpeg probe', {
                message: error?.message
            })
        }
    }

    if (!ffmpegPath) {
        return undefined
    }

    let probeOutput = ''
    try {
        await execFileAsync(
            ffmpegPath,
            ['-hide_banner', '-i', inputPath],
            {
                timeout: 10_000,
                maxBuffer: 2 * 1024 * 1024
            }
        )
    } catch (error: any) {
        probeOutput = String(error?.stderr || '')
    }

    const match = probeOutput.match(/Video:[^\n]*?,\s*(\d+(?:\.\d+)?)\s*fps/)
    return parseFrameRate(match?.[1])
}

/** true, если файл уже собран в нынешнем квадратном макете 1080×1080. */
export const isSquareReelVideo = (dimensions: VideoDimensions) =>
    dimensions.width === REEL_SIZE && dimensions.height === REEL_SIZE

/** Прямоугольник кадра в пикселях: размер и смещение от левого верхнего угла. */
export type CropRect = {
    x: number
    y: number
    w: number
    h: number
}

/** Ширина чёрной полосы с каждой стороны кадра, пиксели. */
export type BorderBars = {
    top: number
    right: number
    bottom: number
    left: number
}

export type BorderCheckResult = BorderBars & {
    /** true, если ни одна полоса не шире допуска (или кадров не хватило для проверки). */
    ok: boolean
    /** false, если проверить не удалось: слишком мало пригодных кадров. */
    verified: boolean
    width: number
    height: number
    sampledFrames: number
    usedFrames: number
    tolerancePx: number
}

type SourceAnalysis = {
    crop?: CropRect
    averageY: number
}

/** Запас под плашкой-ватермаркой, доля высоты картинки (край плашки сглажен). */
const BANNER_MARGIN_SHARE = 0.015

/** Больше этой доли высоты сверху ради плашки не срезаем: это уже не плашка, а ошибка поиска. */
const BANNER_MAX_CUT_SHARE = 0.3

/**
 * Срезает верх прямоугольника картинки ниже плашки-ватермарки (watermarkBanner.ts),
 * если она найдена в кадрах фрагмента. Квадрат потом берётся из оставшейся
 * картинки, прижатым к низу: ни сама плашка, ни её «вытянутая» версия в кадр
 * не попадают. Сбой поиска сборку не останавливает.
 */
const cropBelowWatermarkBanner = async (
    inputPath: string,
    segment: ReelSegment,
    picture: CropRect
): Promise<{rect: CropRect, banner: WatermarkBanner | null}> => {
    if (!watermarkCheckEnabled()) return {rect: picture, banner: null}

    try {
        const banner = await detectWatermarkBanner(
            inputPath,
            sampleTimes(segment.startSeconds, segment.durationSeconds, BANNER_SAMPLE_COUNT),
            picture,
            false
        )

        if (!banner) {
            console.log('[REEL WATERMARK] No banner in the top left corner')
            return {rect: picture, banner: null}
        }

        const cut = ceilEven((banner.bottomShare + BANNER_MARGIN_SHARE) * picture.h)

        if (cut > picture.h * BANNER_MAX_CUT_SHARE) {
            console.warn('[REEL WATERMARK] Banner looks too tall; not cropping', {banner, cutPx: cut})
            return {rect: picture, banner}
        }

        const rect = {x: picture.x, y: picture.y + cut, w: picture.w, h: toEven(picture.h - cut)}

        console.log('[REEL WATERMARK] Banner found; cropping below it', {
            bottomPercent: Number((banner.bottomShare * 100).toFixed(1)),
            rightPercent: Number((banner.rightShare * 100).toFixed(1)),
            frames: `${banner.frames}/${banner.sampledFrames}`,
            cutTopPx: cut,
            crop: `${rect.w}:${rect.h}:${rect.x}:${rect.y}`
        })

        return {rect, banner}

    } catch (error: any) {
        console.warn('[REEL WATERMARK] Banner search failed; keeping the picture as is', {
            message: error?.message || error
        })
        return {rect: picture, banner: null}
    }
}

/**
 * Строка или столбец считаются чёрными, если МЕДИАНА яркости вдоль них не выше
 * этого значения (limited range: чёрный = 16). Именно медиана, а не максимум:
 * вшитые субтитры, лежащие в чёрной полосе, закрывают меньше половины строки
 * и полосу не ломают. Раньше cropdetect считал такую полосу картинкой.
 */
const BLACK_LINE_MEDIAN = 24

/** Сколько кадров берём для поиска полос и для проверки готового клипа. */
const BORDER_SAMPLE_COUNT = 12

/** Ширина кадров для анализа исходника (4K уменьшается до 960 пикселей). */
const BORDER_ANALYSIS_WIDTH = 960

/** Полоса принимается, если одинаковую ширину показывает столько кадров. */
const BORDER_SOURCE_SUPPORT = 0.4

/** Для проверки клипа: настоящая полоса есть почти во всех кадрах, а статичная тёмная сцена нет. */
const BORDER_CHECK_SUPPORT = 0.75

/** Разброс ширины одной и той же полосы между кадрами, строки анализа. */
const BORDER_TOLERANCE_ROWS = 2

/** Минимум пригодных (не чёрных) кадров, при котором результату можно верить. */
const BORDER_MIN_FRAMES = 3

/** Одна полоса не может занимать больше этой доли кадра. */
const BORDER_MAX_EDGE_SHARE = 0.4

/** Параллельных запусков ffmpeg при взятии кадров. */
const BORDER_PARALLEL = 3

const toEven = (value: number) => Math.floor(value / 2) * 2
const ceilEven = (value: number) => Math.ceil(value / 2) * 2

const readEnvNumber = (name: string, fallback: number, min: number, max: number) => {
    const raw = process.env[name]
    const value = raw === undefined || raw.trim() === '' ? Number.NaN : Number(raw)
    return Number.isFinite(value) && value >= min && value <= max ? value : fallback
}

/** Допуск проверки: полоса уже этого числа пикселей готового клипа не считается. */
const borderTolerancePx = () => readEnvNumber('REEL_BORDER_TOLERANCE_PX', 3, 1, 50)

/** REEL_BORDER_CHECK=off отключает проверку и повторную сборку. */
const borderCheckEnabled = () =>
    (process.env.REEL_BORDER_CHECK ?? '').trim().toLowerCase() !== 'off'

/** REEL_BORDER_CHECK_STRICT=true: полоса после исправления останавливает сборку. */
const borderCheckStrict = () =>
    (process.env.REEL_BORDER_CHECK_STRICT ?? '').trim().toLowerCase() === 'true'

type GrayFrames = {
    width: number
    height: number
    frames: Buffer[]
    requested: number
}

/**
 * Достаёт кадры 8-бит серого, уменьшенные до analysisWidth.
 * accurateSeek=false берёт ближайший ключевой кадр: для 4K AV1 это на порядок
 * быстрее, декодируется один кадр, а не вся группа кадров до нужной секунды.
 * Одинаковые кадры (несколько точек попали в один ключевой) отбрасываются.
 */
const sampleGrayFrames = async (
    videoPath: string,
    times: number[],
    source: VideoDimensions,
    analysisWidth: number,
    accurateSeek: boolean
): Promise<GrayFrames> => {
    if (!ffmpegPath) {
        throw new Error('[REEL BORDER] ffmpeg-static binary not found')
    }
    const binary = ffmpegPath

    const scale = Math.min(1, analysisWidth / source.width)
    const width = Math.max(2, toEven(Math.round(source.width * scale)))
    const height = Math.max(2, toEven(Math.round(source.height * scale)))
    const frameBytes = width * height
    const filter = scale < 1
        ? `scale=${width}:${height}:flags=area,format=gray`
        : 'format=gray'

    const results: Array<Buffer | null> = times.map(() => null)
    let nextIndex = 0

    const worker = async () => {
        while (nextIndex < times.length) {
            const index = nextIndex++
            try {
                const {stdout} = await execFileAsync(
                    binary,
                    [
                        '-hide_banner',
                        '-loglevel', 'error',
                        '-nostdin',
                        ...(accurateSeek ? [] : ['-noaccurate_seek']),
                        '-ss', times[index]!.toFixed(3),
                        '-i', videoPath,
                        '-an',
                        '-sn',
                        '-frames:v', '1',
                        '-vf', filter,
                        '-pix_fmt', 'gray',
                        '-f', 'rawvideo',
                        '-'
                    ],
                    {
                        encoding: 'buffer',
                        timeout: 30_000,
                        maxBuffer: frameBytes + 1024 * 1024
                    }
                )

                if (stdout.length === frameBytes) {
                    results[index] = stdout
                }
            } catch {
                // Кадр не получился (конец файла, сбой декодера): пропускаем его.
            }
        }
    }

    await Promise.all(
        Array.from({length: Math.min(BORDER_PARALLEL, times.length)}, worker)
    )

    const unique = new Map<string, Buffer>()
    for (const frame of results) {
        if (frame) {
            unique.set(createHash('md5').update(frame).digest('hex'), frame)
        }
    }

    return {width, height, frames: [...unique.values()], requested: times.length}
}

/** Медиана count значений с шагом step, начиная с позиции start. */
const lineMedian = (
    frame: Buffer,
    start: number,
    step: number,
    count: number
): number => {
    const histogram = new Uint32Array(256)
    for (let i = 0, position = start; i < count; i++, position += step) {
        histogram[frame[position]!]!++
    }

    const half = count / 2
    let sum = 0
    for (let value = 0; value < 256; value++) {
        sum += histogram[value]!
        if (sum >= half) {
            return value
        }
    }
    return 255
}

/**
 * Сколько чёрных столбцов слева и справа и строк сверху и снизу в одном кадре.
 * Столбцы считаем первыми и по всей высоте: вертикальное видео в горизонтальном
 * кадре занимает меньше половины ширины, и медиана строки по всей ширине была бы
 * чёрной везде. Строки считаем уже только внутри найденной ширины картинки.
 * null — кадр целиком чёрный: он ничего не говорит о полосах.
 */
const measureFrameBars = (
    frame: Buffer,
    width: number,
    height: number
): BorderBars | null => {
    const columnIsBlack = (column: number) =>
        lineMedian(frame, column, width, height) <= BLACK_LINE_MEDIAN

    let left = 0
    while (left < width && columnIsBlack(left)) {
        left++
    }
    if (left >= width) {
        return null
    }

    let right = 0
    while (right < width - left && columnIsBlack(width - 1 - right)) {
        right++
    }

    const bandLeft = left
    const bandWidth = width - left - right
    if (bandWidth < 8) {
        return null
    }

    const rowIsBlack = (row: number) =>
        lineMedian(frame, row * width + bandLeft, 1, bandWidth) <= BLACK_LINE_MEDIAN

    let top = 0
    while (top < height && rowIsBlack(top)) {
        top++
    }
    if (top >= height) {
        return null
    }

    let bottom = 0
    while (bottom < height - top && rowIsBlack(height - 1 - bottom)) {
        bottom++
    }

    return {top, right, bottom, left}
}

/**
 * Типичная ширина полосы по набору кадров. Подходит значение, которое с допуском
 * повторяется минимум в minSupport кадрах; из таких берётся наибольшее. Так
 * тёмная сцена (полоса в одном кадре «выросла» за счёт чёрного неба) и кадр
 * без полос (смена формата) не сдвигают результат, а настоящая полоса,
 * постоянная по всему ролику, всегда набирает нужную поддержку.
 */
const estimateBarRows = (runs: number[], minSupport: number): number => {
    const sorted = [...runs].sort((a, b) => a - b)
    let best = 0

    for (const start of sorted) {
        const window = sorted.filter(
            value => value >= start && value <= start + BORDER_TOLERANCE_ROWS
        )
        if (window.length < minSupport) {
            continue
        }

        const median = window[Math.floor((window.length - 1) / 2)]!
        if (median > best) {
            best = median
        }
    }

    return best
}

type DetectedBars = BorderBars & {
    usedFrames: number
    measuredFrames: BorderBars[]
}

/** Полосы по всем кадрам, в строках анализа. null — пригодных кадров мало. */
const detectBars = (
    frames: GrayFrames,
    supportShare: number
): DetectedBars | null => {
    const measured = frames.frames
        .map(frame => measureFrameBars(frame, frames.width, frames.height))
        .filter((bars): bars is BorderBars => bars !== null)

    if (measured.length < BORDER_MIN_FRAMES) {
        return null
    }

    const minSupport = Math.max(2, Math.ceil(measured.length * supportShare))
    const estimate = (pick: (bars: BorderBars) => number) =>
        estimateBarRows(measured.map(pick), minSupport)

    return {
        top: estimate(bars => bars.top),
        right: estimate(bars => bars.right),
        bottom: estimate(bars => bars.bottom),
        left: estimate(bars => bars.left),
        usedFrames: measured.length,
        measuredFrames: measured
    }
}

/** Средняя яркость внутри прямоугольника кадра анализа (без чёрных полос). */
const meanLuma = (
    frame: Buffer,
    width: number,
    left: number,
    top: number,
    right: number,
    bottom: number
): number => {
    let sum = 0
    let count = 0
    for (let row = top; row < bottom; row++) {
        const offset = row * width
        for (let column = left; column < right; column++) {
            sum += frame[offset + column]!
            count++
        }
    }
    return count ? sum / count : 0
}

/** Точки отбора кадров, равномерно по отрезку. */
const sampleTimes = (startSeconds: number, durationSeconds: number, count: number) =>
    Array.from(
        {length: count},
        (_, index) => startSeconds + durationSeconds * (index + 0.5) / count
    )

/**
 * Анализируем только выбранный фрагмент: берём 12 кадров по всей его длине,
 * находим чёрные полосы (медиана яркости строк и столбцов) и среднюю яркость
 * самой картинки. Прежний cropdetect по первым 5 секундам считал вшитые субтитры
 * внутри чёрной полосы частью картинки и оставлял в квадрате чёрную кромку.
 */
const analyzeSelectedSegment = async (
    inputPath: string,
    segment: ReelSegment,
    source: VideoDimensions
): Promise<SourceAnalysis> => {
    try {
        const sampled = await sampleGrayFrames(
            inputPath,
            sampleTimes(segment.startSeconds, segment.durationSeconds, BORDER_SAMPLE_COUNT),
            source,
            BORDER_ANALYSIS_WIDTH,
            false
        )

        const detected = detectBars(sampled, BORDER_SOURCE_SUPPORT)
        if (!detected) {
            console.warn('[REEL CROPDETECT] Not enough usable frames; keeping source dimensions', {
                requested: sampled.requested,
                distinctFrames: sampled.frames.length
            })
            return {crop: undefined, averageY: 0}
        }

        const rowFactor = source.height / sampled.height
        const columnFactor = source.width / sampled.width
        // +1 строка анализа запаса: на границе кадр усреднён с чёрным.
        const toSource = (rows: number, factor: number) =>
            rows > 0 ? ceilEven((rows + 1) * factor) : 0

        const bars: BorderBars = {
            top: toSource(detected.top, rowFactor),
            bottom: toSource(detected.bottom, rowFactor),
            left: toSource(detected.left, columnFactor),
            right: toSource(detected.right, columnFactor)
        }

        const cropWidth = toEven(source.width - bars.left - bars.right)
        const cropHeight = toEven(source.height - bars.top - bars.bottom)
        const tooWide =
            Math.max(bars.left, bars.right) > source.width * BORDER_MAX_EDGE_SHARE ||
            Math.max(bars.top, bars.bottom) > source.height * BORDER_MAX_EDGE_SHARE ||
            cropWidth < source.width * 0.25 ||
            cropHeight < source.height * 0.25

        let crop: CropRect | undefined
        if (tooWide) {
            console.warn('[REEL CROPDETECT] Implausible black bars; keeping source dimensions', bars)
        } else if (bars.top + bars.bottom + bars.left + bars.right > 0) {
            crop = {x: bars.left, y: bars.top, w: cropWidth, h: cropHeight}
        }

        // Яркость берём по самой картинке: чёрные полосы её занижали
        // и без нужды включали осветление.
        const picture = {
            left: detected.left,
            top: detected.top,
            right: sampled.width - detected.right,
            bottom: sampled.height - detected.bottom
        }
        const lumaValues = sampled.frames.map(frame =>
            meanLuma(frame, sampled.width, picture.left, picture.top, picture.right, picture.bottom)
        )
        const averageY = lumaValues.length
            ? lumaValues.reduce((sum, value) => sum + value, 0) / lumaValues.length
            : 0

        console.log('[REEL BORDER DETECT]', {
            sourceSize: `${source.width}x${source.height}`,
            analysisSize: `${sampled.width}x${sampled.height}`,
            requestedFrames: sampled.requested,
            distinctFrames: sampled.frames.length,
            usedFrames: detected.usedFrames,
            barsPx: bars
        })

        if (crop) {
            console.log('[REEL CROPDETECT] Detected crop:', `${crop.w}:${crop.h}:${crop.x}:${crop.y}`)
        } else {
            console.log('[REEL CROPDETECT] No black bars detected; keeping source dimensions')
        }

        // Вторая проблема рядом с полосами: плашка канала в левом верхнем углу.
        // Ищем её уже внутри картинки без полос.
        const pictureRect = crop ?? {x: 0, y: 0, w: toEven(source.width), h: toEven(source.height)}
        const {rect, banner} = await cropBelowWatermarkBanner(inputPath, segment, pictureRect)

        return {crop: banner && rect !== pictureRect ? rect : crop, averageY}

    } catch (error: any) {
        // Анализ вспомогательный: не допускаем, чтобы неудачный анализ
        // полностью останавливал генерацию Reel.
        console.warn('[REEL SOURCE ANALYSIS FALLBACK]', {
            message: error?.message || error,
            stderr: error?.stderr
        })

        return {
            crop: undefined,
            averageY: 0
        }
    }
}

/**
 * Проверка готового клипа: нет ли в кадре чёрных полос сверху, снизу и по бокам.
 * Берёт 12 кадров по всей длине, считает полосы теми же методами, что и анализ
 * исходника, и сообщает ширину в пикселях клипа. Для clean 1080×1080 допуск —
 * REEL_BORDER_TOLERANCE_PX (по умолчанию 3 пикселя).
 */
export const checkBlackBorders = async (videoPath: string): Promise<BorderCheckResult> => {
    const [dimensions, duration] = await Promise.all([
        probeVideoDimensions(videoPath),
        getInputVideoDuration(videoPath)
    ])

    const margin = Math.min(0.3, duration / 10)
    const sampled = await sampleGrayFrames(
        videoPath,
        sampleTimes(margin, Math.max(0.1, duration - margin * 2), BORDER_SAMPLE_COUNT),
        dimensions,
        // Для квадрата 1080 это масштаб 1:1: ширина полосы точна до пикселя.
        Math.max(dimensions.width, 2),
        true
    )

    const tolerancePx = borderTolerancePx()
    const detected = detectBars(sampled, BORDER_CHECK_SUPPORT)

    if (!detected) {
        return {
            ok: true,
            verified: false,
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            width: dimensions.width,
            height: dimensions.height,
            sampledFrames: sampled.requested,
            usedFrames: 0,
            tolerancePx
        }
    }

    const rowFactor = dimensions.height / sampled.height
    const columnFactor = dimensions.width / sampled.width
    const bars: BorderBars = {
        top: Math.round(detected.top * rowFactor),
        bottom: Math.round(detected.bottom * rowFactor),
        left: Math.round(detected.left * columnFactor),
        right: Math.round(detected.right * columnFactor)
    }

    return {
        ok: Math.max(bars.top, bars.right, bars.bottom, bars.left) < tolerancePx,
        verified: true,
        ...bars,
        width: dimensions.width,
        height: dimensions.height,
        sampledFrames: sampled.requested,
        usedFrames: detected.usedFrames,
        tolerancePx
    }
}

/**
 * Проверка готового клипа на плашку-ватермарку в левом верхнем углу. Возвращает,
 * сколько пикселей клипа сверху нужно срезать (0 — плашки нет или проверка выключена).
 */
export const checkWatermarkBannerInClip = async (
    videoPath: string
): Promise<{cutTopPx: number, banner: WatermarkBanner | null}> => {
    if (!watermarkCheckEnabled()) return {cutTopPx: 0, banner: null}

    const [dimensions, duration] = await Promise.all([
        probeVideoDimensions(videoPath),
        getInputVideoDuration(videoPath)
    ])

    const margin = Math.min(0.3, duration / 10)
    const banner = await detectWatermarkBanner(
        videoPath,
        sampleTimes(margin, Math.max(0.1, duration - margin * 2), BANNER_SAMPLE_COUNT),
        {x: 0, y: 0, w: toEven(dimensions.width), h: toEven(dimensions.height)},
        true
    )

    if (!banner) return {cutTopPx: 0, banner: null}

    const cutTopPx = Math.ceil((banner.bottomShare + BANNER_MARGIN_SHARE) * dimensions.height)

    // Слишком большая «плашка» — ошибка поиска, клип не трогаем.
    return cutTopPx > dimensions.height * BANNER_MAX_CUT_SHARE
        ? {cutTopPx: 0, banner}
        : {cutTopPx, banner}
}

/** Квадрат, который ffmpeg вырежет из rect по центру (второй crop в фильтре). */
const squareOfRect = (rect: CropRect): CropRect => {
    const side = toEven(Math.min(rect.w, rect.h))
    return {
        x: rect.x + toEven((rect.w - side) / 2),
        y: rect.y + toEven((rect.h - side) / 2),
        w: side,
        h: side
    }
}

/**
 * Новый прямоугольник исходника, из которого вырезается клип без найденных
 * проверкой полос. bars измерены в пикселях клипа (1080×1080), поэтому
 * переводим их в пиксели исходника по масштабу квадрата.
 */
const shrinkRectForBars = (
    rect: CropRect,
    bars: BorderBars,
    tolerancePx: number
): CropRect => {
    const square = squareOfRect(rect)
    const scale = square.w / REEL_SIZE
    // +2 пикселя клипа запаса: полоса и картинка на границе смешаны.
    const toSource = (value: number) =>
        value >= tolerancePx ? ceilEven((value + 2) * scale) : 0

    const left = toSource(bars.left)
    const right = toSource(bars.right)
    const top = toSource(bars.top)
    const bottom = toSource(bars.bottom)

    return {
        x: square.x + left,
        y: square.y + top,
        w: toEven(square.w - left - right),
        h: toEven(square.h - top - bottom)
    }
}

/**
 * Как shrinkRectForBars, но для режима слежения: полосы, найденные в клипе, срезаются
 * с краёв всей картинки (масштаб по стороне квадрата), а не с центрального квадрата.
 */
const shrinkPictureForBars = (
    rect: CropRect,
    bars: BorderBars,
    tolerancePx: number
): CropRect => {
    const scale = Math.min(rect.w, rect.h) / REEL_SIZE
    const toSource = (value: number) =>
        value >= tolerancePx ? ceilEven((value + 2) * scale) : 0

    const left = toSource(bars.left)
    const right = toSource(bars.right)
    const top = toSource(bars.top)
    const bottom = toSource(bars.bottom)

    return {
        x: rect.x + left,
        y: rect.y + top,
        w: toEven(rect.w - left - right),
        h: toEven(rect.h - top - bottom)
    }
}

const formatBars = (result: BorderBars) =>
    `top ${result.top}px, right ${result.right}px, bottom ${result.bottom}px, left ${result.left}px`

export const prepareInstagramVideo = async (
    inputPath: string,
    keyTrailer: string,
    options: {
        /** Номер фрагмента трейлера (calculateReelSegment), 0 — прежний. */
        segmentVariant?: number
        /**
         * Как выбирать квадрат по X: center — по центру картинки (трейлеры);
         * track — следить за главным лицом (нарезки, tracking/faceTrack.ts).
         * По Y обрезка одна и та же: чёрные полосы и плашка канала.
         */
        framing?: 'center' | 'track'
    } = {}
) => {
    if (!ffmpegPath) {
        throw new Error('[PREPARE INSTAGRAM VIDEO] ffmpeg-static binary not found')
    }
    const binary = ffmpegPath

    // UUID исключает конфликт временных файлов при повторных/параллельных вызовах.
    const outputPath = path.join(
        path.dirname(inputPath),
        `${keyTrailer}_${randomUUID()}_instagram_prepared.mp4`
    )

    const startedAt = Date.now()

    try {
        // Важно: inputPath должен быть ПОЛНЫМ исходным трейлером, а не заранее
        // обрезанным первым фрагментом.
        const totalDurationSeconds = await getInputVideoDuration(inputPath)
        const segmentVariant = options.segmentVariant ?? 0
        const segment = calculateReelSegment(totalDurationSeconds, segmentVariant)

        console.log('[REEL SEGMENT SELECTED]', {
            ...segment,
            variant: segmentVariant,
            reservedStartSeconds: segment.startSeconds,
            reservedEndSeconds: Number(
                (segment.totalDurationSeconds - segment.endSeconds).toFixed(3)
            )
        })

        const source = await probeVideoDimensions(inputPath)
        const sourceFrameRate = await probeVideoFrameRate(inputPath)
        const outputFrameRate = resolveOutputFrameRate(sourceFrameRate)
        const analysis = await analyzeSelectedSegment(inputPath, segment, source)

        console.log('[REEL FPS]', {
            source: sourceFrameRate ? `${sourceFrameRate.rate} (${sourceFrameRate.fps.toFixed(3)})` : null,
            output: outputFrameRate.rate
        })

        // Цветокоррекция, лёгкое шумоподавление и резкость (enhanceSettings.ts). Раньше eq
        // получали только тёмные исходники, теперь мягкая коррекция идёт у всех; REEL_ENHANCE=off
        // возвращает прежнее поведение.
        const enhance = await buildEnhanceFilters(binary, analysis.averageY)
        const colorCorrection = enhance.chain

        console.log('[REEL ENHANCE] ' + JSON.stringify({
            applied: enhance.applied,
            skipped: enhance.skipped,
            ...enhance.settings
        }))

        console.log('[REEL SOURCE ANALYSIS]', {
            averageY: Number(analysis.averageY.toFixed(2)),
            darkSource: analysis.averageY < 110,
            crop: analysis.crop
                ? `${analysis.crop.w}:${analysis.crop.h}:${analysis.crop.x}:${analysis.crop.y}`
                : null
        })

        // Квадрат 1080×1080 из центра картинки без чёрных полос. Размытого фона,
        // виньетки и нижнего градиента больше нет: макет «чистое видео 1:1».
        // Слежение за лицом (нарезки): траектория камеры по X внутри картинки без полос
        // и плашки. Сбой или отсутствие лиц — обычный квадрат по центру.
        const fullPicture: CropRect = {x: 0, y: 0, w: toEven(source.width), h: toEven(source.height)}
        let faceTrack: FaceTrack | null = null

        if (options.framing === 'track') {
            try {
                faceTrack = await trackMainFace(inputPath, segment, analysis.crop ?? fullPicture)
                console.log('[REEL FACE TRACK]', faceTrack
                    ? {...faceTrack.stats, cameraRangePx: [
                        Math.round(Math.min(...faceTrack.centers)),
                        Math.round(Math.max(...faceTrack.centers))
                    ]}
                    : 'No faces (or no room to move); centered square')
            } catch (error: any) {
                console.warn('[REEL FACE TRACK] Tracking failed; centered square', {
                    message: error?.message || error
                })
            }
        }

        const trackCommandsPath = path.join(path.dirname(outputPath), `${randomUUID()}_track.cmd`)

        const encodeClean = async (rect: CropRect | undefined) => {
            const picture = rect ?? fullPicture
            const side = toEven(Math.min(picture.w, picture.h))
            const tracked = faceTrack !== null && picture.w - side >= 4

            let squareFilter = `crop='min(iw,ih)':'min(iw,ih)',`
            if (tracked) {
                // Квадрат двигается по X покадрово (sendcmd → crop@track), по Y по центру картинки.
                const {firstX, minX, maxX} = await writeTrackCommands(
                    trackCommandsPath, faceTrack!, picture, side, outputFrameRate.fps, segment.durationSeconds
                )
                squareFilter =
                    `sendcmd=f=${path.basename(trackCommandsPath)},` +
                    `crop@track=${side}:${side}:${firstX}:${toEven((picture.h - side) / 2)},`
                console.log('[REEL FACE TRACK] Moving square', {side, minX, maxX, picture: `${picture.w}:${picture.h}:${picture.x}:${picture.y}`})
            }

            const cropFilter = rect || tracked ? `crop=${picture.w}:${picture.h}:${picture.x}:${picture.y},` : ''
            const filterComplex =
                `[0:v]${cropFilter}${squareFilter}` +
                `scale=${REEL_SIZE}:${REEL_SIZE}:flags=lanczos+accurate_rnd+full_chroma_int${colorCorrection},` +
                'setsar=1,format=yuv420p[vout]'

            await execFileAsync(
                binary,
                [
                    '-y',
                    '-hide_banner',
                    '-loglevel', 'error',
                    '-filter_complex_threads', '2',
                    // Обрезаем фрагмент на входе в том же проходе, в котором
                    // строится clean-видеокомпозиция. Отдельный trim/encode не нужен.
                    '-ss', segment.startSeconds.toFixed(3),
                    '-i', inputPath,
                    '-filter_complex', filterComplex,
                    '-map', '[vout]',
                    '-map', '0:a?',
                    '-t', segment.durationSeconds.toFixed(3),
                    // Clean — промежуточный файл: из него собирается финальный ролик (второе
                    // кодирование), потом Instagram пережимает его в третий раз, поэтому запас
                    // по качеству здесь нужен. veryfast CRF 16 с High-профилем (B-кадры, CABAC);
                    // прежний ultrafast давал Constrained Baseline. Подробности: encodeSettings.ts.
                    ...getX264Args('clean'),
                    '-pix_fmt', 'yuv420p',
                    // Родная частота исходника (resolveOutputFrameRate): 24→30 дублированием
                    // кадров через один даёт подёргивание.
                    '-r', outputFrameRate.rate,
                    '-c:a', 'aac',
                    // Звук проходит два AAC-кодирования (clean и финал), поэтому здесь запас.
                    '-b:a', '192k',
                    '-ar', '48000',
                    // Громкость нормализуется один раз в decorateInstagramVideo.ts.
                    '-movflags', '+faststart',
                    '-shortest',
                    outputPath
                ],
                {
                    timeout: 240_000,
                    maxBuffer: 20 * 1024 * 1024,
                    // sendcmd читает файл команд по имени: путь без «C:» и пробелов.
                    cwd: path.dirname(trackCommandsPath)
                }
            )
        }

        try {
            await encodeClean(analysis.crop)
        } catch (error) {
            await unlink(trackCommandsPath).catch(() => undefined)
            throw error
        }

        // Проверка готового клипа. Результат поиска полос по исходнику не доверяем
        // вслепую: если в клипе осталась полоса, один раз пересобираем его с
        // дополнительной обрезкой ровно на найденную ширину.
        if (borderCheckEnabled()) {
            try {
                let check = await checkBlackBorders(outputPath)
                let bannerCheck = await checkWatermarkBannerInClip(outputPath)
                console.log('[REEL BORDER CHECK]', {
                    ok: check.ok,
                    verified: check.verified,
                    bars: formatBars(check),
                    usedFrames: check.usedFrames,
                    tolerancePx: check.tolerancePx,
                    watermarkCutTopPx: bannerCheck.cutTopPx
                })

                if (!check.ok || bannerCheck.cutTopPx > 0) {
                    const baseRect: CropRect = analysis.crop ?? {
                        x: 0,
                        y: 0,
                        w: toEven(source.width),
                        h: toEven(source.height)
                    }
                    // Плашка в клипе обрабатывается как полоса сверху своей высоты.
                    const barsToRemove: BorderBars = {
                        top: Math.max(check.ok ? 0 : check.top, bannerCheck.cutTopPx),
                        right: check.ok ? 0 : check.right,
                        bottom: check.ok ? 0 : check.bottom,
                        left: check.ok ? 0 : check.left
                    }
                    // При слежении квадрат ездит по картинке, поэтому сужается сама картинка,
                    // а не центральный квадрат (иначе камере некуда двигаться).
                    const correctedRect = faceTrack
                        ? shrinkPictureForBars(baseRect, barsToRemove, check.tolerancePx)
                        : shrinkRectForBars(baseRect, barsToRemove, check.tolerancePx)

                    console.warn('[REEL BORDER CHECK] Black borders or watermark found; re-encoding with a tighter crop', {
                        found: formatBars(barsToRemove),
                        watermark: bannerCheck.banner,
                        crop: `${correctedRect.w}:${correctedRect.h}:${correctedRect.x}:${correctedRect.y}`
                    })

                    await encodeClean(correctedRect)
                    check = await checkBlackBorders(outputPath)
                    bannerCheck = await checkWatermarkBannerInClip(outputPath)

                    console.log('[REEL BORDER CHECK] After correction', {
                        ok: check.ok,
                        verified: check.verified,
                        bars: formatBars(check),
                        usedFrames: check.usedFrames,
                        watermarkCutTopPx: bannerCheck.cutTopPx
                    })

                    if (!check.ok || bannerCheck.cutTopPx > 0) {
                        const message =
                            `[REEL BORDER CHECK] Black borders or watermark remain after correction: ${formatBars(check)}, ` +
                            `watermark ${bannerCheck.cutTopPx}px`
                        if (borderCheckStrict()) {
                            throw new Error(message)
                        }
                        console.warn(message)
                    }
                }
            } catch (error: any) {
                if (borderCheckStrict() && String(error?.message).startsWith('[REEL BORDER CHECK]')) {
                    throw error
                }
                // Проверка вспомогательная: её сбой не должен ронять сборку клипа.
                console.warn('[REEL BORDER CHECK] Check failed; keeping the prepared clip', {
                    message: error?.message || error
                })
            }
        }

        await unlink(trackCommandsPath).catch(() => undefined)

        console.log('[PREPARE INSTAGRAM VIDEO DONE]', {
            outputPath,
            layout: `${REEL_SIZE}x${REEL_SIZE}`,
            totalDurationSeconds: segment.totalDurationSeconds,
            segmentStartSeconds: segment.startSeconds,
            durationSeconds: segment.durationSeconds,
            segmentEndSeconds: segment.endSeconds,
            sizeBytes: (await stat(outputPath)).size,
            durationMs: Date.now() - startedAt
        })

    } catch (error: any) {
        console.error('[PREPARE INSTAGRAM VIDEO ERROR]', {
            inputPath,
            outputPath,
            durationMs: Date.now() - startedAt,
            stderr: error?.stderr,
            message: error?.message
        })

        throw error
    }

    return outputPath
}
