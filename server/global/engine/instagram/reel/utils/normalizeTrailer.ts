import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import path from 'node:path'
import ffmpegPath from 'ffmpeg-static'

const execFileAsync = promisify(execFile)

export const normalizeTrailer = async (
    inputPath: string,
    keyTrailer: string
) => {
    console.log('[NORMALIZE INPUT]', inputPath)
    console.log('[NORMALIZE DIR]', path.dirname(inputPath))

    const outputPath =
        path.join(
            path.dirname(inputPath),
            `${keyTrailer}_normalized.mp4`
        )

    console.log('[NORMALIZE OUTPUT]', outputPath)

    try {
        await execFileAsync(
            ffmpegPath!,
            [
                '-y',

                '-i',
                inputPath,

                '-vf',
                'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2',

                '-c:v',
                'libx264',

                '-preset',
                'medium',

                '-crf',
                '23',

                '-pix_fmt',
                'yuv420p',

                '-c:a',
                'aac',

                '-b:a',
                '128k',

                '-ar',
                '48000',

                '-ac',
                '2',

                '-movflags',
                '+faststart',

                outputPath
            ],
            {
                maxBuffer:
                    50 * 1024 * 1024
            }
        )
    } catch (error: any) {
        console.error(
            '[NORMALIZE VIDEO ERROR]',
            error?.stderr ||
            error?.message ||
            error
        )

        throw error
    }

    return outputPath
}
