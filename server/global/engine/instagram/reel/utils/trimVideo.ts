import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import path from 'node:path'

const execFileAsync = promisify(execFile)

export const trimVideo = async (
    inputPath: string,
    keyTrailer: string
) => {
    const outputPath =
        path.join(
            path.dirname(inputPath),
            `${keyTrailer}_trimmed.mp4`
        )

    await execFileAsync(
        'ffmpeg',
        [
            '-y',
            '-i',
            inputPath,
            '-t',
            '40',
            '-c:v',
            'libx264',
            '-preset',
            'medium',
            '-crf',
            '23',
            '-c:a',
            'aac',
            '-b:a',
            '128k',
            '-movflags',
            '+faststart',
            outputPath
        ],
        {
            maxBuffer: 10 * 1024 * 1024
        }
    )

    return outputPath
}
