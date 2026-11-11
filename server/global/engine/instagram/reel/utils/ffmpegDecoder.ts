import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import ffmpegPath from 'ffmpeg-static'

const execFileAsync = promisify(execFile)

/**
 * Быстрый декодер для тяжёлых проходов по исходнику (карта нарезки, анализ кадрирования,
 * превью). YouTube отдаёт 4K часто в AV1, а встроенный декодер ffmpeg `av1` медленный
 * (30 с 4K примерно за 11 с на машине владельца); libdav1d в разы быстрее, если он есть
 * в сборке ffmpeg. Возвращает аргументы перед `-i` или пустой список.
 */

let dav1dAvailable: Promise<boolean> | undefined
const codecCache = new Map<string, Promise<string | undefined>>()

const hasDav1d = () => {
    dav1dAvailable ??= (async () => {
        if (!ffmpegPath) return false
        try {
            const {stdout} = await execFileAsync(ffmpegPath as unknown as string, ['-hide_banner', '-decoders'], {maxBuffer: 8 * 1024 * 1024})
            return /\blibdav1d\b/.test(stdout)
        } catch {
            return false
        }
    })()
    return dav1dAvailable
}

const videoCodec = (inputPath: string) => {
    if (!codecCache.has(inputPath)) {
        codecCache.set(inputPath, (async () => {
            if (!ffmpegPath) return undefined
            try {
                await execFileAsync(ffmpegPath as unknown as string, ['-hide_banner', '-i', inputPath], {maxBuffer: 8 * 1024 * 1024})
                return undefined
            } catch (error: any) {
                // Без выходного файла ffmpeg завершается с ошибкой, но описание потоков печатает.
                return String(error?.stderr ?? '').match(/Video:\s*([a-z0-9_]+)/i)?.[1]?.toLowerCase()
            }
        })())
    }
    return codecCache.get(inputPath)!
}

export const fastDecoderArgs = async (inputPath: string): Promise<string[]> => {
    const [codec, dav1d] = await Promise.all([videoCodec(inputPath), hasDav1d()])
    return codec === 'av1' && dav1d ? ['-c:v', 'libdav1d'] : []
}
