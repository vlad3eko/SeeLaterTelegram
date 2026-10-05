import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { stat, unlink } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import ffmpegPath from 'ffmpeg-static'

const execFileAsync = promisify(execFile)
const TELEGRAM_TARGET_BYTES = 45 * 1024 * 1024

const compressionProfiles = [
    { width: 1280, height: 720, crf: 28, audioBitrate: '96k' },
    { width: 854, height: 480, crf: 30, audioBitrate: '80k' },
    { width: 640, height: 360, crf: 32, audioBitrate: '64k' },
    { width: 426, height: 240, crf: 33, audioBitrate: '64k' }
]

export const prepareTelegramVideo = async (inputPath: string) => {
    const inputStat = await stat(inputPath)

    if (inputStat.size <= TELEGRAM_TARGET_BYTES) {
        return inputPath
    }

    console.log('[TELEGRAM COMPRESS]', `input=${(inputStat.size / 1024 / 1024).toFixed(2)} MB`)

    for (const profile of compressionProfiles) {
        const outputPath = path.join(
            path.dirname(inputPath),
            `${path.parse(inputPath).name}_telegram_${profile.width}_${randomUUID()}.mp4`
        )

        try {
            console.log('[TELEGRAM COMPRESS PROFILE]', profile)

            await execFileAsync(
                ffmpegPath!,
                [
                    '-y',
                    '-i', inputPath,
                    '-map', '0:v:0',
                    '-map', '0:a:0?',
                    '-vf', `scale=${profile.width}:${profile.height}:force_original_aspect_ratio=decrease`,
                    '-c:v', 'libx264',
                    '-preset', 'fast',
                    '-crf', String(profile.crf),
                    '-pix_fmt', 'yuv420p',
                    '-c:a', 'aac',
                    '-b:a', profile.audioBitrate,
                    '-ar', '48000',
                    '-ac', '2',
                    '-movflags', '+faststart',
                    outputPath
                ],
                { maxBuffer: 10 * 1024 * 1024 }
            )

            const outputStat = await stat(outputPath)
            const outputSizeMB = outputStat.size / 1024 / 1024
            console.log('[TELEGRAM COMPRESS RESULT]', `${outputSizeMB.toFixed(2)} MB`)

            if (outputStat.size <= TELEGRAM_TARGET_BYTES) {
                return outputPath
            }

            console.log('[TELEGRAM COMPRESS TOO LARGE]', `${outputSizeMB.toFixed(2)} MB`)
            await unlink(outputPath)
        } catch (error: any) {
            try {
                await unlink(outputPath)
            } catch {}
            console.error('[TELEGRAM COMPRESS ERROR]', error?.stderr || error?.message || error)
            throw error
        }
    }

    throw new Error('Unable to compress video below Telegram 50 MB limit')
}
