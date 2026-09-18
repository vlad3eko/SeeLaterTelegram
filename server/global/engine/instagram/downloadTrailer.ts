import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {mkdir} from 'node:fs/promises'
import path from 'node:path'

const execFileAsync = promisify(execFile)

export const downloadTrailer = async (
    keyTrailer: string
) => {
    if (!keyTrailer) {
        throw new Error('Trailer key is missing')
    }

    const outputDir =
        path.join(
            process.cwd(),
            '.tmp',
            'instagram'
        )

    await mkdir(outputDir, {
        recursive: true
    })

    const outputTemplate =
        path.join(
            outputDir,
            `${keyTrailer}.%(ext)s`
        )

    const url =
        `https://www.youtube.com/watch?v=${keyTrailer}`

    await execFileAsync(
        'yt-dlp',
        [
            '--no-playlist',
            '-f',
            'bv*+ba/b',
            '--merge-output-format',
            'mp4',
            '-o',
            outputTemplate,
            url
        ],
        {
            maxBuffer: 10 * 1024 * 1024
        }
    )

    return path.join(
        outputDir,
        `${keyTrailer}.mp4`
    )
}
