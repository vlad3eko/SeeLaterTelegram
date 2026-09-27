import {mkdir} from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import {getYtDlpPath, runYtDlp} from "#server/global/engine/instagram/scripts-yt-bgutil/ytDlp";

export const downloadTrailer = async (
    keyTrailer: string
) => {
    if (!keyTrailer) {
        throw new Error('Trailer key is missing')
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

    const outputTemplate =
        path.join(
            outputDir,
            `${keyTrailer}.%(ext)s`
        )

    const url =
        `https://www.youtube.com/watch?v=${keyTrailer}`

    try {
        const {stdout, stderr} =
            await runYtDlp([
                '--verbose',

                '--js-runtimes',
                `node:${process.execPath}`,

                '--no-playlist',

                '-f',
                'bv*+ba/b',

                '--merge-output-format',
                'mp4',

                '-o',
                outputTemplate,

                url
            ])

        console.log(
            '[YTDLP DOWNLOAD]',
            stdout
        )

        if (stderr) {
            console.log(
                '[YTDLP STDERR]',
                stderr
            )
        }
    } catch (error: any) {
        console.error(
            '[YTDLP DOWNLOAD ERROR]',
            error?.stderr ||
            error?.message ||
            error
        )

        throw error
    }

    return path.join(
        outputDir,
        `${keyTrailer}.mp4`
    )
}
