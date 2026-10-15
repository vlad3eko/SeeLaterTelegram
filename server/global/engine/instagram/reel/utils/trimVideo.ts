import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {stat} from 'node:fs/promises'
import path from 'node:path'
import ffmpegPath from 'ffmpeg-static'

const execFileAsync = promisify(execFile)

export const trimVideo = async (
    inputPath: string,
    keyTrailer: string
) => {
    if (!ffmpegPath) {
        throw new Error('[TRIM VIDEO] ffmpeg-static binary not found')
    }

    const outputPath =
        path.join(
            path.dirname(inputPath),
            `${keyTrailer}_trimmed.mp4`
        )

    const startedAt = Date.now()

    console.log('[TRIM START]', {
        inputPath,
        outputPath
    })

    try {
        await execFileAsync(
            ffmpegPath,
            [
                '-y',
                '-hide_banner',
                '-loglevel',
                'error',

                '-i',
                inputPath,

                '-t',
                '40',

                '-map',
                '0:v:0',

                '-map',
                '0:a?',

                // Обрезаем без повторного кодирования.
                // Нормализация будет выполнена следующим шагом.
                '-c',
                'copy',

                '-avoid_negative_ts',
                'make_zero',

                '-movflags',
                '+faststart',

                outputPath
            ],
            {
                timeout: 60_000,
                maxBuffer: 10 * 1024 * 1024
            }
        )

        const outputStat = await stat(outputPath)

        if (outputStat.size === 0) {
            throw new Error('[TRIM VIDEO] Output file is empty')
        }

        console.log('[TRIM DONE]', {
            outputPath,
            sizeBytes: outputStat.size,
            durationMs: Date.now() - startedAt
        })

        return outputPath

    } catch (error: any) {
        console.error('[TRIM ERROR]', {
            inputPath,
            outputPath,
            durationMs: Date.now() - startedAt,
            message: error?.message,
            stderr: error?.stderr
        })

        throw error
    }
}
