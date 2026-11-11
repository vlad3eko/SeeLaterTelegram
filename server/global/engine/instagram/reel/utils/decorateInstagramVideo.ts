import {promisify} from 'node:util'
import {execFile} from 'node:child_process'
import path from 'node:path'
import ffmpegPath from 'ffmpeg-static'
import {getX264Args} from '#server/global/engine/instagram/reel/utils/encodeSettings'
import {randomUUID} from "node:crypto";
import {mkdir, unlink, writeFile} from "node:fs/promises";
import {
    REEL_SIZE,
    isSquareReelVideo,
    probeVideoDimensions,
    probeVideoFrameRate,
    reelAssetDirectory
} from "./prepareInstagramVideo";
import {existsSync} from "node:fs";

const execFileAsync = promisify(execFile)

export type HookPlateStyle = 'dark' | 'light'

type DecorateInstagramVideoOptions = {
    /** Готовая дорожка субтитров речи (subtitle/prepare-subtitle-track.ts). */
    subtitleAssPath?: string
    /** «Сохрани, чтобы не потерять» эффектом субтитров (subtitle/cta.ts). */
    ctaAssPath?: string
    /** Цвета подложки хука. По умолчанию 'dark'. */
    hookPlate?: HookPlateStyle
}

const escapeFilterPath = (value: string) =>
    value
        .replace(/\\/g, '/')
        .replace(/:/g, '\\:')
        .replace(/'/g, "\\'")

const escapeAssText = (value: string) =>
    value
        .replace(/\\/g, '')
        .replace(/[{}]/g, '')
        .replace(/\r/g, '')
        .replace(/\n/g, '\\N')

const splitHookIntoTwoLines = (hook: string): [string, string] => {
    const normalized = String(hook ?? '')
        .trim()
        .toLocaleUpperCase('ru-RU')

    if (!normalized) {
        throw new Error(
            '[DECORATE] Empty Instagram hook. Check createInstagramHook() logs.'
        )
    }

    const words = normalized.split(' ').filter(Boolean)

    if (words.length < 2) {
        throw new Error(
            `[DECORATE] Hook must contain at least two words: "${normalized}"`
        )
    }

    let bestIndex = 1
    let bestScore = Number.POSITIVE_INFINITY

    for (let index = 1; index < words.length; index++) {
        const firstLine = words.slice(0, index).join(' ')
        const secondLine = words.slice(index).join(' ')

        const longest = Math.max(
            firstLine.length,
            secondLine.length
        )

        const imbalance = Math.abs(
            firstLine.length - secondLine.length
        )

        const overflow = Math.max(0, longest - 25)

        const score = longest * 4 + imbalance + overflow * 20

        if (score < bestScore) {
            bestScore = score
            bestIndex = index
        }
    }

    return [
        words.slice(0, bestIndex).join(' '),
        words.slice(bestIndex).join(' '),
    ]
}

const formatTitleLineAss = (line: string, textColor: string): string => {
    const category = line.match(
        /^(МУЛЬТСЕРИАЛ|МУЛЬТФИЛЬМ|СЕРИАЛ|ФИЛЬМ|АНИМЕ)(?=\s|$)/u
    )

    if (!category) {
        return escapeAssText(line)
    }

    const categoryText = category[1]!

    const rest = line.slice(categoryText.length)

    return (
        `{\\c&H002B26E0&}${escapeAssText(categoryText)}` +
        `{\\c${textColor}}${escapeAssText(rest)}`
    )
}

const clamp = (value: number, min: number, max: number) =>
    Math.max(min, Math.min(max, value))

const formatAssTime = (seconds: number) => {
    const safeSeconds = Math.max(0, seconds)
    const hours = Math.floor(safeSeconds / 3600)
    const minutes = Math.floor((safeSeconds % 3600) / 60)
    const wholeSeconds = Math.floor(safeSeconds % 60)
    const centiseconds = Math.floor((safeSeconds - Math.floor(safeSeconds)) * 100)

    return `${hours}:${String(minutes).padStart(2, '0')}:${String(wholeSeconds).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`
}

/**
 * Подложка хука (решение владельца 11.11, прототип): чёрный фон, белый текст,
 * сверху на видео. Держится около 6% длины ролика (не меньше 4 и не больше
 * 10 с), затем уезжает вверх за кадр. Всё рисуется в ASS: подложка векторным
 * прямоугольником, текст Oswald Bold. Плавность задана отдельным событием на
 * каждый кадр движения (в ASS \move только линейный).
 */
const HOOK_PLATE = {
    // Высота 147 px из 1080: 13,6% кадра, как на прототипе.
    height: 147,
    // Вход: подложка стартует на 22% скрытой, замедление к концу (кубическое).
    entrySeconds: 0.45,
    entryHiddenShare: 0.22,
    // Выход вверх с разгоном к концу (квадратичный).
    exitSeconds: 0.4,
    secondsMin: 4,
    secondsMax: 10,
    shareOfReel: 0.06,
    // Oswald Bold в libass: размер ASS примерно в 1,72 раза больше размера em.
    // 75,6 это em 44 px: прописная «П» высотой 36 px, как на прототипе.
    fontSize: 75.6,
    fontSizeMin: 48,
    // Ширина текста Oswald Bold примерно 0,56 em на знак (с запасом), поле 70 px.
    // Отсюда предельный размер для длинной строки: 940 * 1,72 / 0,56 / знаков.
    fitWidthConstant: 2884,
    // Положение двух строк при размере по умолчанию: базовые линии y=64 и y=119
    // (середина блока совпадает с серединой подложки), шаг 55 px.
    lineStep: 55,
    secondBaseline: 119,
    // Привязка \an2 в libass: низ строки ниже базовой линии на 0,227 размера
    // (замерено на плоских прописных «Н»).
    anchorBelowBaseline: 0.227,
    fps: 30
}

/** Цвета в формате ASS: &HAABBGGRR, альфа 00 непрозрачный, FF прозрачный. */
const HOOK_PLATE_STYLES: Record<HookPlateStyle, { backgroundColour: string, textColour: string }> = {
    // Выбор владельца на прототипе 11.11: rgb(12,12,12), непрозрачность 232/255,
    // белый текст rgb(246,246,244).
    dark: {
        backgroundColour: '&H170C0C0C',
        textColour: '&H00F4F6F6'
    },
    // Проверка 11.11: чуть притемнённый белый rgb(232,232,228), непрозрачность
    // 245/255, чёрный текст rgb(14,14,14).
    light: {
        backgroundColour: '&H0AE4E8E8',
        textColour: '&H000E0E0E'
    }
}

/** Сколько секунд подложка остаётся на экране с учётом входа и выхода. */
export const getHookPlateSeconds = (reelSeconds: number) =>
    Math.min(
        reelSeconds,
        clamp(
            HOOK_PLATE.shareOfReel * reelSeconds,
            HOOK_PLATE.secondsMin,
            HOOK_PLATE.secondsMax
        )
    )

/** Сдвиг подложки по вертикали в пикселях (0 в покое, отрицательный при входе и выходе). */
const getHookPlateOffset = (time: number, total: number) => {
    const entry = HOOK_PLATE.entrySeconds
    const exitStart = total - HOOK_PLATE.exitSeconds

    if (time < entry) {
        return -HOOK_PLATE.height * HOOK_PLATE.entryHiddenShare *
            Math.pow(1 - time / entry, 3)
    }

    if (time < exitStart) {
        return 0
    }

    return -HOOK_PLATE.height *
        Math.pow((time - exitStart) / HOOK_PLATE.exitSeconds, 2)
}

const createHookPlateAss = (
    duration: number,
    hook: string,
    plateStyle: HookPlateStyle = 'dark',
    fps: number = HOOK_PLATE.fps
) => {
    const colours = HOOK_PLATE_STYLES[plateStyle]
    const total = getHookPlateSeconds(duration)
    const [firstLine, secondLine] = splitHookIntoTwoLines(hook)
    const longest = Math.max(firstLine.length, secondLine.length)

    const fontSize = clamp(
        HOOK_PLATE.fitWidthConstant / longest,
        HOOK_PLATE.fontSizeMin,
        HOOK_PLATE.fontSize
    )
    const scale = fontSize / HOOK_PLATE.fontSize
    const step = HOOK_PLATE.lineStep * scale
    // Блок «верх прописных первой строки … базовая линия второй» стоит по центру подложки.
    const secondBaseline = HOOK_PLATE.height / 2 + (36 + HOOK_PLATE.lineStep) * scale / 2
    const firstBaseline = secondBaseline - step
    const anchor = HOOK_PLATE.anchorBelowBaseline * fontSize
    const firstLineY = firstBaseline + anchor
    const secondLineY = secondBaseline + anchor

    // Окна событий совпадают с кадрами ролика (24, 25 или 30 к/с), иначе анимация подложки
    // шла бы рывками: часть окон ни один кадр не попадал бы.
    const frame = 1 / fps
    const frames = Math.ceil(total * fps)
    const events: string[] = []

    // Соседние кадры с одним сдвигом (покой) сливаем в одно событие. Окно события
    // центрируется на моменте кадра: округление времени ASS до сотых его не сдвинет.
    let runStart = 0
    let runOffset = getHookPlateOffset(0, total)

    const pushRun = (fromFrame: number, toFrame: number, offset: number) => {
        const start = Math.max(0, (fromFrame - 0.5) * frame)
        const end = toFrame >= frames - 1
            ? total + 0.05
            : (toFrame + 0.5) * frame
        const y = offset.toFixed(2)
        const first = (offset + firstLineY).toFixed(2)
        const second = (offset + secondLineY).toFixed(2)
        const from = formatAssTime(start)
        const to = formatAssTime(Math.min(end, total + 0.05))

        events.push(
            `Dialogue: 0,${from},${to},HookPlate,,0,0,0,,{\\an7\\pos(0,${y})\\p1}m 0 0 l ${REEL_SIZE} 0 ${REEL_SIZE} ${HOOK_PLATE.height} 0 ${HOOK_PLATE.height}{\\p0}`,
            `Dialogue: 1,${from},${to},HookText,,0,0,0,,{\\an2\\pos(${REEL_SIZE / 2},${first})\\fs${fontSize.toFixed(2)}}${formatTitleLineAss(firstLine, colours.textColour + '&')}`,
            `Dialogue: 1,${from},${to},HookText,,0,0,0,,{\\an2\\pos(${REEL_SIZE / 2},${second})\\fs${fontSize.toFixed(2)}}${formatTitleLineAss(secondLine, colours.textColour + '&')}`
        )
    }

    for (let index = 1; index <= frames; index++) {
        const offset = index < frames
            ? getHookPlateOffset(index * frame, total)
            : Number.NaN

        if (index < frames && Math.abs(offset - runOffset) < 0.005) {
            continue
        }

        pushRun(runStart, index - 1, runOffset)
        runStart = index
        runOffset = offset
    }

    return [
        '[Script Info]',
        'ScriptType: v4.00+',
        `PlayResX: ${REEL_SIZE}`,
        `PlayResY: ${REEL_SIZE}`,
        'WrapStyle: 2',
        'ScaledBorderAndShadow: yes',
        'YCbCr Matrix: None',
        '',
        '[V4+ Styles]',
        'Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding',
        `Style: HookPlate,Oswald,20,${colours.backgroundColour},${colours.backgroundColour},&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1`,
        `Style: HookText,Oswald,${HOOK_PLATE.fontSize},${colours.textColour},${colours.textColour},&H00000000,&H00000000,1,0,0,0,100,100,0,0,1,0,0,2,0,0,0,1`,
        '',
        '[Events]',
        'Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text',
        ...events
    ].join('\n')
}

const getVideoDuration = async (inputPath: string) => {
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
        if (error?.code !== 'ENOENT') {
            console.warn('[REEL FFPROBE FALLBACK]', error?.message || error)
        }
    }

    // ffmpeg-static normally ships without ffprobe. Its input probe prints the
    // duration in stderr without decoding/encoding the whole video.
    if (!ffmpegPath) {
        throw new Error('[DECORATE] ffmpeg-static binary not found')
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
        throw new Error(`[DECORATE] Could not determine video duration: ${inputPath}`)
    }

    const duration = Number(match[1]) * 3600
        + Number(match[2]) * 60
        + Number(match[3])

    if (!Number.isFinite(duration) || duration <= 0) {
        throw new Error(`[DECORATE] Invalid video duration: ${inputPath}`)
    }

    return duration
}

const verifyFonts = (fontsDirectory: string) => {
    // Oswald Bold нужен подложке хука, Montserrat ExtraBold: субтитрам и призыву.
    const requiredFonts = [
        'Oswald-Bold.ttf',
        'Montserrat-ExtraBold.ttf'
    ]

    const missing = requiredFonts.filter(
        filename => !existsSync(path.join(fontsDirectory, filename))
    )

    if (missing.length) {
        throw new Error(
            `[DECORATE] Missing required font file(s) in ${fontsDirectory}: ${missing.join(', ')}`
        )
    }
}

const escapeXml = (value: string) =>
    value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;')

const ensureFontConfig = async (fontsDirectory: string, configDirectory: string): Promise<string> => {
    const fontConfigPath = path.join(configDirectory, 'fonts.conf')
    const fontCacheDirectory = path.join(
        configDirectory,
        'fontconfig-cache'
    )

    await mkdir(configDirectory, {recursive: true})
    await mkdir(fontCacheDirectory, {recursive: true})

    const config = [
        '<?xml version="1.0"?>',
        '<!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">',
        '<fontconfig>',
        `  <dir>${escapeXml(fontsDirectory)}</dir>`,
        `  <cachedir>${escapeXml(fontCacheDirectory)}</cachedir>`,
        '</fontconfig>',
        ''
    ].join('\n')

    await writeFile(fontConfigPath, config, 'utf8')

    console.log('[DECORATE FONTCONFIG READY]', {
        fontConfigPath,
        fontsDirectory,
        fontCacheDirectory
    })

    return fontConfigPath
}

/** Тонкая полоска прогресса по нижнему краю квадрата (решено 11.11). */
const PROGRESS_HEIGHT = 6

export const decorateInstagramVideo = async (inputPath: string, keyTrailer: string, hook: string, options: DecorateInstagramVideoOptions = {}) => {
    if (!ffmpegPath) {
        throw new Error('[DECORATE] ffmpeg-static binary not found')
    }

    const outputPath = path.join(
        path.dirname(inputPath),
        `${keyTrailer}_${randomUUID()}_reel.mp4`
    )

    const fontsDirectory = path.join(process.cwd(), 'public', 'instagram', 'fonts')
    verifyFonts(fontsDirectory)

    // Старый clean 1080x1920 (до перехода на квадрат) оформлять нельзя: подложка,
    // субтитры и полоска рассчитаны на 1080x1080. Его надо пересобрать из исходника.
    const dimensions = await probeVideoDimensions(inputPath)
    if (!isSquareReelVideo(dimensions)) {
        throw new Error(
            `[DECORATE] Expected a ${REEL_SIZE}x${REEL_SIZE} clean video, got ` +
            `${dimensions.width}x${dimensions.height}. Rebuild it with prepareInstagramVideo().`
        )
    }

    // Частота clean сохраняется как есть (его собирал prepareInstagramVideo на родной частоте
    // исходника). Не определилась: 30 к/с.
    const frameRate = (await probeVideoFrameRate(inputPath)) ?? {rate: '30', fps: 30}

    const fontConfigPath = await ensureFontConfig(fontsDirectory, reelAssetDirectory)
    const duration = await getVideoDuration(inputPath)
    const templateAssPath = path.join(
        path.dirname(inputPath),
        `${keyTrailer}_${randomUUID()}_template.ass`
    )

    const activeSubtitleAssPath = options.subtitleAssPath
        ? path.resolve(options.subtitleAssPath)
        : undefined

    if (
        activeSubtitleAssPath &&
        !existsSync(activeSubtitleAssPath)
    ) {
        throw new Error(
            `[DECORATE] Dynamic subtitle ASS file does not exist: ${activeSubtitleAssPath}`
        )
    }

    const ctaAssPath = options.ctaAssPath
        ? path.resolve(options.ctaAssPath)
        : undefined

    if (ctaAssPath && !existsSync(ctaAssPath)) {
        throw new Error(
            `[DECORATE] CTA ASS file does not exist: ${ctaAssPath}`
        )
    }

    const startedAt = Date.now()

    try {
        await writeFile(
            templateAssPath,
            createHookPlateAss(duration, hook, options.hookPlate ?? 'dark', frameRate.fps),
            'utf8'
        )

        const filterParts: string[] = []
        let currentVideoLabel = '0:v'

        const addAss = (assPath: string, outputLabel: string) => {
            filterParts.push(
                `[${currentVideoLabel}]ass=filename='${escapeFilterPath(assPath)}':fontsdir='${escapeFilterPath(fontsDirectory)}'[${outputLabel}]`
            )
            currentVideoLabel = outputLabel
        }

        // Слой 1: субтитры речи (наш эффект) или запасные из SRT/VTT.
        if (activeSubtitleAssPath) {
            addAss(activeSubtitleAssPath, 'withSubtitles')
        }

        // Слой 2: «Сохрани, чтобы не потерять» внизу, в середине и в конце ролика.
        if (ctaAssPath) {
            addAss(ctaAssPath, 'withCta')
        }

        // Слой 3: полоска прогресса у нижнего края (дорожка и заливка).
        const progressY = REEL_SIZE - PROGRESS_HEIGHT
        filterParts.push(
            `[${currentVideoLabel}]drawbox=x=0:y=${progressY}:w=${REEL_SIZE}:h=${PROGRESS_HEIGHT}:color=white@0.22:t=fill[progressTrack]`,
            '[1:v]format=rgba[progressSource]',
            `[progressTrack][progressSource]overlay=x='-w+w*t/${duration.toFixed(3)}':y=${progressY}:shortest=1[withProgress]`
        )

        // Слой 4: подложка хука поверх всего, затем уходит вверх за кадр.
        filterParts.push(
            `[withProgress]ass=filename='${escapeFilterPath(templateAssPath)}':fontsdir='${escapeFilterPath(fontsDirectory)}',format=yuv420p[vout]`
        )

        const filterComplex = filterParts.join(';')

        await execFileAsync(
            ffmpegPath,
            [
                '-y',
                '-hide_banner',
                '-loglevel', 'error',
                '-filter_complex_threads', '1',
                '-filter_threads', '1',
                '-i', inputPath,
                '-f', 'lavfi',
                '-i', `color=c=white:s=${REEL_SIZE}x${PROGRESS_HEIGHT}:r=${frameRate.rate}:d=${duration.toFixed(3)}`,
                '-filter_complex', filterComplex,
                '-map', '[vout]',
                '-map', '0:a?',
                '-t', duration.toFixed(3),
                '-r', frameRate.rate,
                // Финал: второе кодирование после clean, дальше его пережмёт Instagram.
                // veryfast CRF 17 с потолком битрейта 25 Мбит/с (encodeSettings.ts).
                ...getX264Args('final'),
                '-pix_fmt', 'yuv420p',
                '-c:a', 'aac',
                '-b:a', '192k',
                '-ar', '48000',
                '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11',
                '-movflags', '+faststart',
                '-shortest',
                outputPath
            ],
            {
                timeout: 240_000,
                maxBuffer: 30 * 1024 * 1024,
                env: {
                    ...process.env,
                    FONTCONFIG_FILE: fontConfigPath,
                    FONTCONFIG_PATH: path.dirname(fontConfigPath)
                }
            }
        )

        console.log('[DECORATE INSTAGRAM VIDEO DONE]', {
            outputPath,
            layout: `${REEL_SIZE}x${REEL_SIZE}`,
            durationSeconds: Number(duration.toFixed(3)),
            hookPlateSeconds: Number(getHookPlateSeconds(duration).toFixed(2)),
            hookPlate: options.hookPlate ?? 'dark',
            fps: frameRate.rate,
            subtitles: Boolean(activeSubtitleAssPath),
            subtitleMode: activeSubtitleAssPath ? 'dynamic-ass' : 'none',
            saveCta: Boolean(ctaAssPath),
            durationMs: Date.now() - startedAt
        })

    } catch (error: any) {
        console.error('[DECORATE INSTAGRAM VIDEO ERROR]', {
            inputPath,
            outputPath,
            durationMs: Date.now() - startedAt,
            message: error?.message,
            stderr: error?.stderr
        })
        await unlink(outputPath).catch(() => undefined)
        throw error

    } finally {
        await unlink(templateAssPath).catch(() => undefined)
    }

    return outputPath
}
