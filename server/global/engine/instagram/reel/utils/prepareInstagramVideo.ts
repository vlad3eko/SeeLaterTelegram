import {promisify} from 'node:util'
import {execFile} from 'node:child_process'
import {mkdir, writeFile, stat} from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import {deflateSync} from 'node:zlib'
import ffmpegPath from 'ffmpeg-static'
import {randomUUID} from 'node:crypto'

const execFileAsync = promisify(execFile)

const WIDTH = 1080
const HEIGHT = 1920
const VIDEO_WIDTH = 1080
const VIDEO_HEIGHT = 932

const assetDirectory = path.join(os.tmpdir(), 'kinomanov-reel-template')

export type ReelOverlayAssets = {
    background: string
    video: string
    static: string
}

const crcTable = (() => {
    const table = new Uint32Array(256)

    for (let n = 0; n < 256; n++) {
        let c = n

        for (let k = 0; k < 8; k++) {
            c = (c & 1) ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
        }

        table[n] = c >>> 0
    }

    return table
})()

const crc32 = (buffer: Buffer) => {
    let c = 0xFFFFFFFF

    for (const byte of buffer) {
        c = crcTable[(c ^ byte) & 0xFF]! ^ (c >>> 8)
    }

    return (c ^ 0xFFFFFFFF) >>> 0
}

const pngChunk = (type: string, data: Buffer) => {
    const typeBuffer = Buffer.from(type, 'ascii')
    const length = Buffer.alloc(4)
    length.writeUInt32BE(data.length, 0)

    const checksum = Buffer.alloc(4)
    checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0)

    return Buffer.concat([length, typeBuffer, data, checksum])
}

const encodePng = (width: number, height: number, pixels: Buffer) => {
    const rowLength = width * 4
    const raw = Buffer.alloc((rowLength + 1) * height)

    for (let y = 0; y < height; y++) {
        const targetOffset = y * (rowLength + 1)
        raw[targetOffset] = 0
        pixels.copy(raw, targetOffset + 1, y * rowLength, (y + 1) * rowLength)
    }

    const header = Buffer.alloc(13)
    header.writeUInt32BE(width, 0)
    header.writeUInt32BE(height, 4)
    header[8] = 8
    header[9] = 6
    header[10] = 0
    header[11] = 0
    header[12] = 0

    return Buffer.concat([
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        pngChunk('IHDR', header),
        pngChunk('IDAT', deflateSync(raw, {level: 6})),
        pngChunk('IEND', Buffer.alloc(0))
    ])
}

const newPixels = (width: number, height: number) =>
    Buffer.alloc(width * height * 4)

const blendPixel = (
    pixels: Buffer,
    width: number,
    height: number,
    x: number,
    y: number,
    red: number,
    green: number,
    blue: number,
    alpha: number
) => {
    const px = Math.floor(x)
    const py = Math.floor(y)

    if (px < 0 || py < 0 || px >= width || py >= height || alpha <= 0) {
        return
    }

    const index = (py * width + px) * 4
    const sourceAlpha = Math.max(0, Math.min(1, alpha / 255))
    const destinationAlpha = pixels[index + 3]! / 255
    const outputAlpha = sourceAlpha + destinationAlpha * (1 - sourceAlpha)

    if (outputAlpha <= 0) {
        return
    }

    pixels[index] = Math.round(
        (red * sourceAlpha + pixels[index]! * destinationAlpha * (1 - sourceAlpha)) / outputAlpha
    )
    pixels[index + 1] = Math.round(
        (green * sourceAlpha + pixels[index + 1]! * destinationAlpha * (1 - sourceAlpha)) / outputAlpha
    )
    pixels[index + 2] = Math.round(
        (blue * sourceAlpha + pixels[index + 2]! * destinationAlpha * (1 - sourceAlpha)) / outputAlpha
    )
    pixels[index + 3] = Math.round(outputAlpha * 255)
}

const clamp = (value: number, min: number, max: number) =>
    Math.max(min, Math.min(max, value))


export type ReelSegment = {
    totalDurationSeconds: number
    startSeconds: number
    durationSeconds: number
    endSeconds: number
}

const getInputVideoDuration = async (inputPath: string): Promise<number> => {
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
 * Selects the most useful middle section while reserving the trailer ending.
 * Long trailers: 40s, usually starting around midpoint - 10s.
 * 60-70s trailers: use the maximum duration that leaves 18s intro + 12s ending.
 * Short teasers: target 30s where possible, while leaving 20% (max 12s) at the end.
 */
export const calculateReelSegment = (totalDurationSeconds: number): ReelSegment => {
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
    const startSeconds = clamp(targetStart, minStart, maxStart)
    const endSeconds = Math.min(total, startSeconds + durationSeconds)

    return {
        totalDurationSeconds: total,
        startSeconds: Number(startSeconds.toFixed(3)),
        durationSeconds: Number((endSeconds - startSeconds).toFixed(3)),
        endSeconds: Number(endSeconds.toFixed(3))
    }
}

const drawLine = (
    pixels: Buffer,
    width: number,
    height: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    thickness: number,
    color: [number, number, number],
    alpha = 255
) => {
    const radius = thickness / 2
    const minX = clamp(Math.floor(Math.min(x1, x2) - radius - 1), 0, width - 1)
    const maxX = clamp(Math.ceil(Math.max(x1, x2) + radius + 1), 0, width - 1)
    const minY = clamp(Math.floor(Math.min(y1, y2) - radius - 1), 0, height - 1)
    const maxY = clamp(Math.ceil(Math.max(y1, y2) + radius + 1), 0, height - 1)
    const dx = x2 - x1
    const dy = y2 - y1
    const lengthSquared = dx * dx + dy * dy

    for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
            const px = x + 0.5
            const py = y + 0.5
            const t = lengthSquared === 0
                ? 0
                : clamp(((px - x1) * dx + (py - y1) * dy) / lengthSquared, 0, 1)
            const nearestX = x1 + t * dx
            const nearestY = y1 + t * dy
            const distance = Math.hypot(px - nearestX, py - nearestY)
            const coverage = clamp(radius + 0.5 - distance, 0, 1)

            if (coverage > 0) {
                blendPixel(
                    pixels,
                    width,
                    height,
                    x,
                    y,
                    color[0],
                    color[1],
                    color[2],
                    alpha * coverage
                )
            }
        }
    }
}

const drawBezier = (
    pixels: Buffer,
    width: number,
    height: number,
    points: [[number, number], [number, number], [number, number], [number, number]]
) => {
    const [p0, p1, p2, p3] = points
    let previousX = p0[0]
    let previousY = p0[1]
    const steps = 360

    for (let i = 1; i <= steps; i++) {
        const t = i / steps
        const u = 1 - t
        const x = u ** 3 * p0[0]
            + 3 * u ** 2 * t * p1[0]
            + 3 * u * t ** 2 * p2[0]
            + t ** 3 * p3[0]
        const y = u ** 3 * p0[1]
            + 3 * u ** 2 * t * p1[1]
            + 3 * u * t ** 2 * p2[1]
            + t ** 3 * p3[1]

        drawLine(
            pixels,
            width,
            height,
            previousX,
            previousY,
            x,
            y,
            2,
            [245, 242, 238],
            31
        )

        previousX = x
        previousY = y
    }
}

const makeBackgroundOverlay = () => {
    const pixels = newPixels(WIDTH, HEIGHT)
    const centerX = 540
    const centerY = 864
    const radiusX = 763.7
    const radiusY = 1493.4

    for (let y = 0; y < HEIGHT; y++) {
        for (let x = 0; x < WIDTH; x++) {
            const distance = Math.sqrt(
                ((x - centerX) / radiusX) ** 2 +
                ((y - centerY) / radiusY) ** 2
            )

            const alpha = distance <= 0.35
                ? 0
                : 0.75 * clamp((distance - 0.35) / (1 - 0.35), 0, 1)

            const index = (y * WIDTH + x) * 4
            pixels[index] = 0
            pixels[index + 1] = 0
            pixels[index + 2] = 0
            pixels[index + 3] = Math.round(alpha * 255)
        }
    }

    const curves: [[number, number], [number, number], [number, number], [number, number]][] = [
        [[0, 60], [120, 90], [200, 170], [260, 320]],
        [[0, 140], [90, 160], [150, 220], [190, 330]],
        [[0, 0], [80, 80], [150, 210], [150, 410]],
        [[60, 0], [120, 60], [200, 100], [330, 110]],
        [[1080, 1560], [960, 1590], [880, 1670], [820, 1820]],
        [[1080, 1640], [990, 1660], [930, 1720], [890, 1830]],
        [[1080, 1500], [1000, 1580], [930, 1710], [930, 1910]]
    ]

    for (const curve of curves) {
        drawBezier(pixels, WIDTH, HEIGHT, curve)
    }

    return encodePng(WIDTH, HEIGHT, pixels)
}

const makeVideoOverlay = () => {
    const pixels = newPixels(VIDEO_WIDTH, VIDEO_HEIGHT)
    const centerX = 540
    const centerY = 466
    const radiusX = 763.7
    const radiusY = 659.0

    for (let y = 0; y < VIDEO_HEIGHT; y++) {
        for (let x = 0; x < VIDEO_WIDTH; x++) {
            const distance = Math.sqrt(
                ((x - centerX) / radiusX) ** 2 +
                ((y - centerY) / radiusY) ** 2
            )

            const vignette = distance <= 0.45
                ? 0
                : 0.55 * clamp((distance - 0.45) / (1 - 0.45), 0, 1)

            const gradient = y < 520
                ? 0
                : 0.78 * clamp((y - 520) / (932 - 520), 0, 1)

            const alpha = 1 - (1 - vignette) * (1 - gradient)
            const index = (y * VIDEO_WIDTH + x) * 4

            pixels[index] = 0
            pixels[index + 1] = 0
            pixels[index + 2] = 0
            pixels[index + 3] = Math.round(alpha * 255)
        }
    }

    return encodePng(VIDEO_WIDTH, VIDEO_HEIGHT, pixels)
}

const isInsideRoundedRect = (
    x: number,
    y: number,
    left: number,
    top: number,
    right: number,
    bottom: number,
    radius: number
) => {
    const nearestX = clamp(x, left + radius, right - radius)
    const nearestY = clamp(y, top + radius, bottom - radius)

    return Math.hypot(x - nearestX, y - nearestY) <= radius
}

const estimateTextWidth = (text: string, fontSize: number, tracking = 0) => {
    let width = 0

    for (const char of text) {
        if (char === ' ') {
            width += fontSize * 0.30
        } else if (/[.,!?;:'"()]/.test(char)) {
            width += fontSize * 0.28
        } else if (/[ІЇIЙЛЦЩШЖТФ]/.test(char)) {
            width += fontSize * 0.58
        } else {
            width += fontSize * 0.55
        }
    }

    return width + Math.max(0, text.length - 1) * tracking
}

const makeStaticOverlay = () => {
    const pixels = newPixels(WIDTH, HEIGHT)

    // Красные линии по границам видеоблока удалены.
    // Остаётся только отдельная шкала прогресса, которую рисует декоратор.

    // Полупрозрачная капсула с красной обводкой.
    // Полупрозрачная тёмная капсула без красной обводки.
    const left = 150
    const top = 1514
    const right = 930
    const bottom = 1626
    const radius = 56

    for (let y = top; y < bottom; y++) {
        for (let x = left; x < right; x++) {
            const px = x + 0.5
            const py = y + 0.5

            const outer = isInsideRoundedRect(
                px,
                py,
                left,
                top,
                right,
                bottom,
                radius
            )

            if (outer) {
                blendPixel(
                    pixels,
                    WIDTH,
                    HEIGHT,
                    x,
                    y,
                    0,
                    0,
                    0,
                    153
                )
            }
        }
    }

    // Иконка закладки слева от CTA.
    const ctaTextWidth = estimateTextWidth('Сохрани, чтобы не потерять', 34)
    // Обычный пробел между видимой иконкой закладки и текстом.
    const ctaGap = 0
    const ctaGroupWidth = 30 + ctaGap + ctaTextWidth
    const bookmarkLeft = (WIDTH - ctaGroupWidth) / 2
    const bookmarkTop = 1662
    const bookmarkPoints: [number, number, number, number][] = [
        [bookmarkLeft + 7.5, bookmarkTop + 3.75, bookmarkLeft + 22.5, bookmarkTop + 3.75],
        [bookmarkLeft + 22.5, bookmarkTop + 3.75, bookmarkLeft + 22.5, bookmarkTop + 26.25],
        [bookmarkLeft + 22.5, bookmarkTop + 26.25, bookmarkLeft + 15, bookmarkTop + 21.25],
        [bookmarkLeft + 15, bookmarkTop + 21.25, bookmarkLeft + 7.5, bookmarkTop + 26.25],
        [bookmarkLeft + 7.5, bookmarkTop + 26.25, bookmarkLeft + 7.5, bookmarkTop + 3.75]
    ]

    for (const [x1, y1, x2, y2] of bookmarkPoints) {
        drawLine(pixels, WIDTH, HEIGHT, x1, y1, x2, y2, 2.5, [245, 242, 238])
    }

    return encodePng(WIDTH, HEIGHT, pixels)
}

export const ensureReelOverlayAssets = async (): Promise<ReelOverlayAssets> => {
    await mkdir(assetDirectory, {recursive: true})

    const paths: ReelOverlayAssets = {
        background: path.join(assetDirectory, 'ov_bg.png'),
        video: path.join(assetDirectory, 'ov_video.png'),
        // Новое имя обязательно: иначе в тёплом runtime может остаться PNG
        // со старыми красными границами видеоблока.
        static: path.join(assetDirectory, 'ov_static_v3.png')
    }

    const generators: [keyof ReelOverlayAssets, () => Buffer][] = [
        ['background', makeBackgroundOverlay],
        ['video', makeVideoOverlay],
        ['static', makeStaticOverlay]
    ]

    for (const [key, generate] of generators) {
        const assetPath = paths[key]
        let needsGenerate = true

        try {
            const fileStat = await stat(assetPath)
            needsGenerate = fileStat.size < 100
        } catch {
            needsGenerate = true
        }

        if (needsGenerate) {
            const png = generate()
            await writeFile(assetPath, png)
            console.log('[REEL OVERLAY CREATED]', assetPath)
        }
    }

    return paths
}

type SourceAnalysis = {
    crop?: string
    averageY: number
}

/**
 * Анализируем только выбранный фрагмент и только один раз:
 * cropdetect находит чёрные полосы, signalstats оценивает яркость.
 * Это заменяет два отдельных запуска FFmpeg.
 */
const analyzeSelectedSegment = async (
    inputPath: string,
    segment: ReelSegment
): Promise<SourceAnalysis> => {
    if (!ffmpegPath) {
        throw new Error('[PREPARE INSTAGRAM VIDEO] ffmpeg-static binary not found')
    }

    try {
        const sampleDuration = Math.min(5, segment.durationSeconds)
        const {stderr = '', stdout = ''} = await execFileAsync(
            ffmpegPath,
            [
                '-hide_banner',
                '-loglevel', 'info',
                '-ss', segment.startSeconds.toFixed(3),
                '-i', inputPath,
                '-t', sampleDuration.toFixed(3),
                '-vf', 'cropdetect=24:16:0,signalstats,metadata=print',
                '-an',
                '-f', 'null',
                '-'
            ],
            {
                timeout: 30_000,
                maxBuffer: 10 * 1024 * 1024
            }
        )

        const output = `${stderr}\n${stdout}`
        const cropMatches = [...output.matchAll(/crop=(\d+:\d+:\d+:\d+)/g)]
        const crop = cropMatches.at(-1)?.[1]
        const values = [...output.matchAll(/lavfi\.signalstats\.YAVG\s*[:=]\s*([\d.]+)/g)]
            .map(match => Number(match[1]))
            .filter(Number.isFinite)

        const averageY = values.length
            ? values.reduce((sum, value) => sum + value, 0) / values.length
            : 0

        if (!crop) {
            console.log('[REEL CROPDETECT] No black bars detected; keeping source dimensions')
        } else {
            console.log('[REEL CROPDETECT] Detected crop:', crop)
        }

        if (!values.length) {
            console.warn('[REEL BRIGHTNESS] YAVG unavailable; applying normal color correction')
        }

        return {crop, averageY}

    } catch (error: any) {
        // Анализ вспомогательный: не допускаем, чтобы неудачный cropdetect
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

export const prepareInstagramVideo = async (
    inputPath: string,
    keyTrailer: string
) => {
    if (!ffmpegPath) {
        throw new Error('[PREPARE INSTAGRAM VIDEO] ffmpeg-static binary not found')
    }

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
        const segment = calculateReelSegment(totalDurationSeconds)

        console.log('[REEL SEGMENT SELECTED]', {
            ...segment,
            reservedStartSeconds: segment.startSeconds,
            reservedEndSeconds: Number(
                (segment.totalDurationSeconds - segment.endSeconds).toFixed(3)
            )
        })

        const [assets, analysis] = await Promise.all([
            ensureReelOverlayAssets(),
            analyzeSelectedSegment(inputPath, segment)
        ])

        const cropFilter = analysis.crop ? `crop=${analysis.crop},` : ''
        const colorCorrection = analysis.averageY >= 110
            ? ''
            : ',eq=gamma=1.25:contrast=1.1:saturation=1.1'

        console.log('[REEL SOURCE ANALYSIS]', {
            averageY: Number(analysis.averageY.toFixed(2)),
            applyColorCorrection: analysis.averageY < 110,
            crop: analysis.crop ?? null
        })

        const filterComplex = [
            // Разделяем исходное видео на фон и основной видеоблок.
            `[0:v]${cropFilter}split=2[backgroundSource][videoSource]`,

            // Размытый фон из исходного видео на весь вертикальный холст.
            '[backgroundSource]scale=270:480:force_original_aspect_ratio=increase,' +
            'crop=270:480,gblur=sigma=11.5,scale=1080:1920,' +
            "eq=saturation=1.25,lutrgb=r='val*0.42':g='val*0.42':b='val*0.42'[backgroundBase]",

            // Основное видео 1080x932.
            `[videoSource]scale=1080:932:force_original_aspect_ratio=increase,` +
            `crop=1080:932:(iw-1080)*0.5:(ih-932)*0.5${colorCorrection}[mainVideo]`,

            // Основное видео поверх размытого фона.
            '[backgroundBase][mainVideo]overlay=0:482:shortest=1[videoPlaced]',

            // Виньетка и нижний градиент основного видеоблока.
            '[videoPlaced][1:v]overlay=0:482:shortest=1,setsar=1,format=yuv420p[vout]'
        ].join(';')

        await execFileAsync(
            ffmpegPath,
            [
                '-y',
                '-hide_banner',
                '-loglevel', 'error',
                '-filter_complex_threads', '2',
                // Обрезаем фрагмент на входе в том же проходе, в котором
                // строится clean-видеокомпозиция. Отдельный trim/encode не нужен.
                '-ss', segment.startSeconds.toFixed(3),
                '-i', inputPath,

                '-loop', '1',
                '-framerate', '30',
                '-i', assets.video,
                '-filter_complex', filterComplex,
                '-map', '[vout]',
                '-map', '0:a?',
                '-t', segment.durationSeconds.toFixed(3),
                '-c:v', 'libx264',
                '-preset', 'ultrafast',
                // Clean — промежуточный файл для последующего декорирования/повтора.
                // CRF 21 заметно экономнее прежнего CRF 18, сохраняя хорошее качество.
                '-crf', '21',
                '-threads', '2',
                '-profile:v', 'high',
                '-pix_fmt', 'yuv420p',
                '-r', '30',
                '-c:a', 'aac',
                '-b:a', '128k',
                '-ar', '48000',
                // Громкость нормализуется один раз в decorateInstagramVideo.ts.
                '-movflags', '+faststart',
                '-shortest',
                outputPath
            ],
            {
                timeout: 240_000,
                maxBuffer: 20 * 1024 * 1024
            }
        )

        console.log('[PREPARE INSTAGRAM VIDEO DONE]', {
            outputPath,
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
