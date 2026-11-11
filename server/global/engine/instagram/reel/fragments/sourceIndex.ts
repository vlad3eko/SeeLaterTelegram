import {spawn} from 'node:child_process'
import path from 'node:path'
import {randomUUID} from 'node:crypto'
import ffmpegPath from 'ffmpeg-static'
import {getInputVideoDuration} from '#server/global/engine/instagram/reel/utils/prepareInstagramVideo'
import type {SourceBoundaries} from '#server/global/engine/instagram/reel/fragments/snapFragments'
import {fastDecoderArgs} from '#server/global/engine/instagram/reel/utils/ffmpegDecoder'

/**
 * Карта исходника нарезки за один проход ffmpeg по всему ролику:
 * - лёгкая копия для Gemini (360p, 8 к/с, звук моно) — грузить 4K в Gemini незачем,
 *   он смотрит видео примерно кадр в секунду;
 * - точные склейки (scdet по всем кадрам на уменьшенной картинке);
 * - паузы в звуке (silencedetect) — естественные начала и концы реплик.
 */

export type SourceIndex = SourceBoundaries & {
    /** Лёгкая копия для Gemini (временный файл). */
    proxyPath: string
}

const SCDET_THRESHOLD = 10
const SILENCE_NOISE = '-35dB'
const SILENCE_MIN_SECONDS = 0.35

const runIndexPass = (args: string[], timeoutMs: number) =>
    new Promise<{code: number | null, log: string[]}>((resolve, reject) => {
        const child = spawn(ffmpegPath as unknown as string, args, {stdio: ['ignore', 'ignore', 'pipe']})
        const log: string[] = []
        let partial = ''
        const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs)

        child.stderr.on('data', (chunk: Buffer) => {
            const lines = (partial + chunk.toString()).split(/\r?\n/)
            partial = lines.pop() ?? ''
            for (const line of lines) {
                if (/lavfi\.scd\.time|silence_(start|end)|Error|error/.test(line)) log.push(line)
            }
        })
        child.on('error', error => {
            clearTimeout(timer)
            reject(error)
        })
        child.on('close', code => {
            clearTimeout(timer)
            resolve({code, log})
        })
    })

export const buildSourceIndex = async (sourcePath: string, workDirectory: string): Promise<SourceIndex> => {
    if (!ffmpegPath) {
        throw new Error('[REEL FRAGMENTS] ffmpeg-static binary not found')
    }

    const duration = await getInputVideoDuration(sourcePath)
    const proxyPath = path.join(workDirectory, `${randomUUID()}_proxy.mp4`)

    // Кадр уменьшается один раз до разделения на ветки: масштабирование 4K в каждой
    // ветке занимало больше времени, чем само декодирование.
    const videoArgs = [
        '-hide_banner', '-loglevel', 'info', '-nostats', '-nostdin', '-y',
        ...await fastDecoderArgs(sourcePath),
        '-i', sourcePath,
        '-filter_complex',
        '[0:v]scale=640:-2:flags=fast_bilinear,split[a][b];[a]scale=-2:360,fps=8[proxy];' +
        `[b]scale=320:-2,scdet=threshold=${SCDET_THRESHOLD},nullsink`,
        '-map', '[proxy]',
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '32'
    ]
    const audioArgs = [
        '-map', '0:a:0',
        '-af', `silencedetect=noise=${SILENCE_NOISE}:d=${SILENCE_MIN_SECONDS}`,
        '-c:a', 'aac', '-b:a', '48k', '-ac', '1'
    ]
    const outputArgs = ['-movflags', '+faststart', proxyPath]

    // Ролик без звука: второй проход без звуковой ветки (пауз тогда нет).
    let result = await runIndexPass([...videoArgs, ...audioArgs, ...outputArgs], 15 * 60_000)
    if (result.code !== 0) {
        console.warn('[REEL FRAGMENTS] Index pass with audio failed; retrying without audio', {log: result.log.slice(-5)})
        result = await runIndexPass([...videoArgs, '-an', ...outputArgs], 15 * 60_000)
    }
    if (result.code !== 0) {
        throw new Error(`[REEL FRAGMENTS] Source index failed: ${result.log.slice(-5).join(' | ')}`)
    }

    const cuts: number[] = []
    const silences: Array<{start: number, end: number}> = []
    let silenceStart: number | undefined

    for (const line of result.log) {
        const cut = line.match(/lavfi\.scd\.time:\s*([\d.]+)/)
        if (cut) cuts.push(Number(cut[1]))
        const start = line.match(/silence_start:\s*(-?[\d.]+)/)
        if (start) silenceStart = Math.max(0, Number(start[1]))
        const end = line.match(/silence_end:\s*([\d.]+)/)
        if (end && silenceStart !== undefined) {
            silences.push({start: silenceStart, end: Number(end[1])})
            silenceStart = undefined
        }
    }
    if (silenceStart !== undefined) silences.push({start: silenceStart, end: duration})

    cuts.sort((a, b) => a - b)

    console.log('[REEL FRAGMENTS] Source index', {
        durationSeconds: Math.round(duration),
        cuts: cuts.length,
        silences: silences.length
    })

    return {duration, cuts, silences, proxyPath}
}
