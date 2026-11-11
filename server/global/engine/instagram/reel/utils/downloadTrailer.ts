import {mkdir, readdir, rename, rm} from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import {runYtDlp} from "#server/global/engine/instagram/scripts-yt-bgutil/ytDlp";
import ffmpegPath from "ffmpeg-static";
import {isYouTubeVideoId} from "#server/global/engine/instagram/reel/utils/extractYouTubeVideoId";
import {probeVideoDimensions} from "#server/global/engine/instagram/reel/utils/prepareInstagramVideo";

// YouTube с серверных IP (Cloud Run, Vercel) периодически отвечает 403 посреди загрузки,
// хотя метаданные получены. Повторный запуск заново получает ссылку на видео и обычно проходит.
const DOWNLOAD_ATTEMPTS = 3
const RETRY_DELAYS_MS = [3_000, 8_000]

// Эти ошибки повтором не лечатся: видео закрыто, удалено или недоступно, либо неверна настройка cookies.
const PERMANENT_ERROR_PATTERN =
    /video unavailable|private video|has been removed|account associated with this video has been terminated|not available in your country|is not a valid url|members-only|this video is not available|\[YOUTUBE COOKIES\]/i

/**
 * YouTube включает для части сессий режим SABR: у клиентов mweb, web_safari, а иногда и у остальных
 * пропадают прямые ссылки на HD и 4K, и остаётся только формат 18 (360p).
 * https://github.com/yt-dlp/yt-dlp/issues/12482
 * Признак режима: yt-dlp пишет, что часть форматов пропущена. Какие клиенты в данный момент
 * отдают полный набор, заранее неизвестно, поэтому пробуем наборы клиентов по очереди
 * и оставляем лучший результат. Повтор первого набора в конце нужен потому, что режим
 * назначается сессии случайно: тот же набор может сработать со второй попытки.
 */
const DEFAULT_CLIENT_SETS = [
    'mweb,tv,web_safari',
    'android,android_vr,tv_downgraded',
    'tv_samsung,visionos,ios',
    'mweb,tv,web_safari'
]

const HIDDEN_FORMATS_PATTERN =
    /missing a URL|SABR|DRM protected|require a GVS PO Token which was not provided/i

const SOURCE_PRINT_PREFIX = 'REEL_SOURCE'

// Для Reel: наибольшее разрешение, а при равном SDR раньше HDR. По умолчанию yt-dlp предпочитает
// HDR, а ролик кодируется в SDR без тон-маппинга, цвета были бы блёклыми.
const REEL_FORMAT_SORT = 'res,+hdr'

// Для Telegram: не выше 1080p, при равном разрешении H.264 + AAC (m4a). Такой файл играет везде,
// склеивается без перекодирования и обычно укладывается в лимит бота 50 МБ. 4K для чата не нужен.
const TELEGRAM_FORMAT_SORT = 'res:1080,vcodec:h264,acodec:m4a'

const sleep = (ms: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * Класс разрешения так, как его называет YouTube: 1080 для 1920×1080 и для 1920×804 (формат 2.39:1),
 * 2160 для 3840×2160, 360 для 640×360. Горизонтальный кадр измеряется по ширине (как кадр 16:9),
 * иначе кинематографичный трейлер 1080p считался бы «804p» и признавался низким.
 */
export const resolutionTier = (width: number, height: number) =>
    Math.max(
        Math.min(width, height),
        Math.round(Math.max(width, height) * 9 / 16)
    )

const readHeightEnv = (name: string, fallback: number) => {
    const raw = process.env[name]
    const value = raw === undefined || raw.trim() === '' ? Number.NaN : Number(raw)
    return Number.isFinite(value) && value >= 0 && value <= 8640 ? value : fallback
}

/** Наборы клиентов: YTDLP_PLAYER_CLIENT_SETS="набор1|набор2", внутри набора клиенты через запятую. */
const getClientSets = () => {
    const sets = (process.env.YTDLP_PLAYER_CLIENT_SETS ?? '')
        .split('|')
        .map((value) => value.trim())
        .filter(Boolean)

    return sets.length ? sets : DEFAULT_CLIENT_SETS
}

export class LowSourceQualityError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'LowSourceQualityError'
    }
}

type SourceCandidate = {
    file: string
    clients: string
    width: number
    height: number
    /** Класс разрешения (resolutionTier): 360, 720, 1080, 1440, 2160. */
    quality: number
    hiddenFormats: boolean
    format: string
    codec: string
    fps: string
    dynamicRange: string
}

// Остатки неудачной попытки (.part, .f137.mp4, .ytdl, .tryN.mp4) убираем, чтобы следующая попытка начала с чистого файла.
const removeDownloadLeftovers = async (
    outputDir: string,
    keyTrailer: string
) => {
    try {
        const names = await readdir(outputDir)

        await Promise.all(
            names
                .filter((name) => name.startsWith(`${keyTrailer}.`))
                .map((name) => rm(path.join(outputDir, name), {force: true}))
        )
    } catch {
        // Папки может не быть или файл занят: это не должно скрывать исходную ошибку скачивания.
    }
}

/**
 * Реальный размер скачанного файла. Сначала ffprobe (он видит то, что получилось на самом деле),
 * при его отказе размер, который напечатал yt-dlp. Сбой замера не должен ронять попытку: файл
 * уже скачан, а повторная загрузка 4K стоит минуты.
 */
const measureDownloadedFile = async (
    file: string,
    printed: string[] | undefined
): Promise<{width: number, height: number, measured: boolean}> => {
    try {
        const dimensions = await probeVideoDimensions(file)
        return {width: dimensions.width, height: dimensions.height, measured: true}
    } catch (error: any) {
        const width = Number(printed?.[6])
        const height = Number(printed?.[7])

        console.warn('[TRAILER SOURCE] Could not measure the downloaded file; using the size reported by yt-dlp', {
            message: error?.message,
            width: printed?.[6],
            height: printed?.[7]
        })

        if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
            return {width, height, measured: true}
        }

        return {width: 0, height: 0, measured: false}
    }
}

/** Одна загрузка yt-dlp с заданным набором клиентов и замер того, что получилось. */
const downloadWithClients = async (
    url: string,
    outputDir: string,
    keyTrailer: string,
    index: number,
    clients: string,
    formatSort: string
): Promise<SourceCandidate> => {
    const outputTemplate =
        path.join(outputDir, `${keyTrailer}.try${index}.%(ext)s`)

    const {stdout, stderr} =
        await runYtDlp([
            '--ffmpeg-location',
            ffmpegPath!,

            '--no-playlist',

            '-f',
            'bv*+ba/b',

            '-S',
            formatSort,

            '--merge-output-format',
            'mp4',

            // Какой формат на самом деле скачан (уходит в лог и в итог сухого прогона).
            '--print',
            `after_move:${SOURCE_PRINT_PREFIX}|%(filepath)s|%(format_id)s|%(vcodec)s|%(fps)s|%(dynamic_range)s|%(width)s|%(height)s`,
            '--no-simulate',

            '-o',
            outputTemplate,

            url
        ], {playerClients: clients})

    console.log(
        `[YTDLP DOWNLOAD] clients=${clients}`,
        stdout
    )

    if (stderr) {
        console.log(
            `[YTDLP STDERR] clients=${clients}`,
            stderr
        )
    }

    const printed = stdout
        .split(/\r?\n/)
        .find((line) => line.startsWith(`${SOURCE_PRINT_PREFIX}|`))
        ?.split('|')

    const file = printed?.[1]?.trim()
        || path.join(outputDir, `${keyTrailer}.try${index}.mp4`)

    const dimensions = await measureDownloadedFile(file, printed)

    return {
        file,
        clients,
        width: dimensions.width,
        height: dimensions.height,
        quality: dimensions.measured
            ? resolutionTier(dimensions.width, dimensions.height)
            // Размер не удалось определить ни ffprobe, ни yt-dlp: файл скачан, выбрасывать его
            // нельзя. Считаем его годным, но не 4K (чтобы перебор клиентов не остановился зря).
            : readHeightEnv('REEL_SOURCE_MIN_HEIGHT', 1080),
        hiddenFormats: HIDDEN_FORMATS_PATTERN.test(String(stderr)),
        format: printed?.[2]?.trim() || 'unknown',
        codec: printed?.[3]?.trim() || 'unknown',
        fps: printed?.[4]?.trim() || 'unknown',
        dynamicRange: printed?.[5]?.trim() || 'unknown'
    }
}

/**
 * Скачивает трейлер в лучшем доступном качестве: перебирает наборы клиентов, пока не получит
 * полный набор форматов или 4K, и оставляет лучший файл как `<ключ>.mp4`.
 *
 * Качество не должно падать молча: если YouTube скрыл HD/4K у всех наборов и лучшее, что удалось
 * получить, ниже REEL_SOURCE_MIN_HEIGHT (по умолчанию 1080), выбрасывается LowSourceQualityError.
 * Из 360p квадрат 1080×1080 получается размытым, такой ролик лучше не выпускать.
 */
const downloadBestQuality = async (
    url: string,
    outputDir: string,
    keyTrailer: string,
    finalPath: string,
    forTelegram: boolean
) => {
    const targetHeight = readHeightEnv('REEL_SOURCE_TARGET_HEIGHT', 2160)
    const minHeight = readHeightEnv('REEL_SOURCE_MIN_HEIGHT', 1080)
    const clientSets = getClientSets()

    const candidates: SourceCandidate[] = []
    let lastError: unknown

    for (let index = 0; index < clientSets.length; index++) {
        const clients = clientSets[index]!

        try {
            const bestBefore = Math.max(0, ...candidates.map((item) => item.quality))
            const candidate = await downloadWithClients(
                url, outputDir, keyTrailer, index, clients,
                forTelegram ? TELEGRAM_FORMAT_SORT : REEL_FORMAT_SORT
            )
            candidates.push(candidate)

            console.log(
                '[TRAILER SOURCE] ' + JSON.stringify({
                    attempt: index + 1,
                    clients: candidate.clients,
                    width: candidate.width,
                    height: candidate.height,
                    tier: candidate.quality,
                    format: candidate.format,
                    codec: candidate.codec,
                    fps: candidate.fps,
                    dynamicRange: candidate.dynamicRange,
                    hiddenFormats: candidate.hiddenFormats
                })
            )

            // Достаточно: 4K получен или YouTube не скрывал форматы (значит, это максимум видео).
            // Для Telegram (forTelegram) картинка не решает: берём первый удачный результат.
            if (forTelegram || candidate.quality >= targetHeight || !candidate.hiddenFormats) {
                break
            }

            // Хорошее качество уже есть и следующий набор лучше не стал: выше, скорее всего, ничего нет.
            if (
                candidates.length >= 2 &&
                Math.max(...candidates.map((item) => item.quality)) >= minHeight &&
                candidate.quality <= bestBefore
            ) {
                break
            }

            console.warn(
                `[TRAILER QUALITY] ${candidate.width}x${candidate.height} with clients "${clients}", `
                + 'YouTube hid part of the formats (SABR). Trying the next client set.'
            )
        } catch (error: any) {
            lastError = error

            const details =
                String(error?.stderr || error?.message || error)

            if (PERMANENT_ERROR_PATTERN.test(details)) {
                throw error
            }

            console.warn(
                `[TRAILER QUALITY] Client set "${clients}" failed, trying the next one`,
                details.slice(0, 500)
            )
        }
    }

    if (candidates.length === 0) {
        throw lastError ?? new Error('[TRAILER QUALITY] No client set produced a video')
    }

    const best = candidates.reduce(
        (winner, item) => item.quality > winner.quality ? item : winner
    )

    if (!forTelegram && best.hiddenFormats && best.quality < minHeight) {
        throw new LowSourceQualityError(
            `[TRAILER QUALITY] YouTube returned only ${best.width}x${best.height} for this session ` +
            `(client sets tried: ${clientSets.join(' | ')}). ` +
            `Minimum is ${minHeight}p (REEL_SOURCE_MIN_HEIGHT). Try again later or from another network.`
        )
    }

    if (best.hiddenFormats && best.quality < targetHeight && !forTelegram) {
        console.warn(
            `[TRAILER QUALITY] Best available is ${best.width}x${best.height}; ` +
            `higher formats may exist but YouTube hid them for this session`
        )
    }

    await Promise.all(
        candidates
            .filter((item) => item !== best)
            .map((item) => rm(item.file, {force: true}))
    )
    await rm(finalPath, {force: true})
    await rename(best.file, finalPath)

    console.log(
        '[TRAILER SOURCE] FINAL ' + JSON.stringify({
            clients: best.clients,
            width: best.width,
            height: best.height,
            tier: best.quality,
            format: best.format,
            codec: best.codec,
            fps: best.fps,
            dynamicRange: best.dynamicRange,
            hiddenFormats: best.hiddenFormats
        })
    )

    return best
}

export type DownloadTrailerOptions = {
    /**
     * true: трейлер нужен только для Telegram. Не перебирать наборы клиентов, не требовать
     * минимального разрешения, качать не выше 1080p в H.264 + AAC. На Reel такой файл не годится.
     */
    forTelegram?: boolean
}

export const downloadTrailer = async (
    keyTrailer: string,
    options: DownloadTrailerOptions = {}
) => {
    if (!keyTrailer) {
        throw new Error('Trailer key is missing')
    }

    if (!isYouTubeVideoId(keyTrailer)) {
        throw new Error('Trailer key is not a valid YouTube video id')
    }

    const outputDir =
        path.join(
            os.tmpdir(),
            'instagram'
        )

    await mkdir(
        outputDir,
        {
            recursive: true
        }
    )

    const url =
        `https://www.youtube.com/watch?v=${keyTrailer}`

    const finalPath =
        path.join(
            outputDir,
            `${keyTrailer}.mp4`
        )

    for (let attempt = 1; attempt <= DOWNLOAD_ATTEMPTS; attempt++) {
        try {
            await downloadBestQuality(
                url,
                outputDir,
                keyTrailer,
                finalPath,
                options.forTelegram === true
            )

            break
        } catch (error: any) {
            const details =
                String(error?.stderr || error?.message || error)

            console.error(
                '[YTDLP DOWNLOAD ERROR]',
                {attempt, attempts: DOWNLOAD_ATTEMPTS},
                details
            )

            const isLastAttempt =
                attempt === DOWNLOAD_ATTEMPTS

            // Низкое качество уже проверено на всех наборах клиентов, ещё один круг ничего не даст.
            if (
                isLastAttempt ||
                error instanceof LowSourceQualityError ||
                PERMANENT_ERROR_PATTERN.test(details)
            ) {
                await removeDownloadLeftovers(outputDir, keyTrailer)
                throw error
            }

            await removeDownloadLeftovers(outputDir, keyTrailer)

            const delayMs =
                RETRY_DELAYS_MS[attempt - 1] ?? RETRY_DELAYS_MS.at(-1)!

            console.warn(
                `[YTDLP DOWNLOAD RETRY] attempt ${attempt + 1}/${DOWNLOAD_ATTEMPTS} in ${delayMs} ms`
            )

            await sleep(delayMs)
        }
    }

    return finalPath
}
