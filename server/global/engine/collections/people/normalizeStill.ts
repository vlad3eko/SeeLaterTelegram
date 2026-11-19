import {spawn} from 'node:child_process'
import ffmpegPath from 'ffmpeg-static'

/**
 * Кадры подборки именинника — одного вида: горизонтальные 16:9, ровно 1280×720 (из них потом
 * собирается пост или карусель Instagram: горизонтальный пост допускает до 1.91:1, 16:9 подходит).
 * Картинка скачивается целиком, ffmpeg (ffmpeg-static, как у Reels) читает её размер: мельче
 * MIN_SOURCE_WIDTH или не горизонтальная — не берётся (растянутая выглядит мыльной). Подходящая
 * обрезается по центру до 16:9 и уменьшается до 1280×720, JPEG высокого качества.
 */

export const STILL_WIDTH = 1280
export const STILL_HEIGHT = 720
/** Исходник уже 1280 — без растягивания; немного меньше (1100) ещё выглядит чётко. */
export const MIN_SOURCE_WIDTH = 1100
/** Горизонтальный кадр: от 4:3 (1.33) до широкого экрана 2.39 — обрезка до 16:9 съедает не больше четверти. */
export const MIN_RATIO = 1.3
export const MAX_RATIO = 2.5
const MAX_BYTES = 15 * 1024 * 1024

/** Размер картинки из вывода ffmpeg: «Stream #0:0: Video: mjpeg …, 1920x1080 …». */
export const frameSize = (log: string): {width: number, height: number} | undefined => {
    const match = /Stream #\d+:\d+.*?Video:.*?\b(\d{2,5})x(\d{2,5})\b/.exec(log)
    return match ? {width: Number(match[1]), height: Number(match[2])} : undefined
}

/** Подходит ли исходник: крупный и горизонтальный. */
export const acceptFrame = (size?: {width: number, height: number}) =>
    Boolean(size && size.width >= MIN_SOURCE_WIDTH && size.width / size.height >= MIN_RATIO && size.width / size.height <= MAX_RATIO)

/** Скачать картинку (не больше 15 МБ; не картинка или ошибка — undefined). */
export const downloadImage = async (url: string, fetchImpl: typeof fetch = fetch): Promise<Buffer | undefined> => {
    try {
        const response = await fetchImpl(url, {
            // Часть сайтов не отдаёт картинку без браузерного заголовка.
            headers: {'User-Agent': 'Mozilla/5.0 (compatible; collections-bot/1.0)', Accept: 'image/*'},
            signal: AbortSignal.timeout(15_000)
        })
        if (!response.ok || !String(response.headers.get('content-type') ?? '').startsWith('image/')) return undefined
        if (Number(response.headers.get('content-length') ?? 0) > MAX_BYTES) return undefined
        const buffer = Buffer.from(await response.arrayBuffer())
        return buffer.length && buffer.length <= MAX_BYTES ? buffer : undefined
    } catch {
        return undefined
    }
}

const runFfmpeg = (args: string[], input: Buffer): Promise<{stdout: Buffer, log: string, code: number | null}> =>
    new Promise((resolve, reject) => {
        if (!ffmpegPath) return reject(new Error('[COLLECTIONS] ffmpeg-static binary not found'))
        const child = spawn(ffmpegPath as unknown as string, args, {stdio: ['pipe', 'pipe', 'pipe']})
        const out: Buffer[] = []
        let log = ''
        const timer = setTimeout(() => child.kill('SIGKILL'), 20_000)
        child.stdout.on('data', chunk => out.push(chunk))
        child.stderr.on('data', chunk => { log += chunk })
        child.on('error', error => { clearTimeout(timer); reject(error) })
        child.on('close', code => { clearTimeout(timer); resolve({stdout: Buffer.concat(out), log, code}) })
        child.stdin.on('error', () => undefined)
        child.stdin.end(input)
    })

/**
 * Картинка → JPEG 1280×720 (обрезка по центру до 16:9). undefined — мелкая, не горизонтальная
 * или не картинка.
 */
export const normalizeStill = async (image: Buffer): Promise<Buffer | undefined> => {
    const filter = `scale=${STILL_WIDTH}:${STILL_HEIGHT}:force_original_aspect_ratio=increase:flags=lanczos,crop=${STILL_WIDTH}:${STILL_HEIGHT}`
    const {stdout, log, code} = await runFfmpeg(
        ['-hide_banner', '-i', 'pipe:0', '-frames:v', '1', '-vf', filter, '-q:v', '2', '-f', 'image2', '-c:v', 'mjpeg', 'pipe:1'],
        image
    )
    if (!acceptFrame(frameSize(log))) return undefined
    return code === 0 && stdout.length ? stdout : undefined
}
