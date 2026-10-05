import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import path from 'node:path'
import {existsSync} from 'node:fs'

import {
    ensureBgutilRunning
} from "#server/global/engine/instagram/scripts-yt-bgutil/bgutil"


const execFileAsync =
    promisify(execFile)


const getBgutilUrl = () => {

    const url =
        process.env.BGUTIL_URL?.trim()


    if (url) {

        return url.replace(
            /\/$/,
            ''
        )
    }


    if (
        process.env.VERCEL === '1'
    ) {

        throw new Error(
            '[BGUTIL] BGUTIL_URL is missing in production'
        )
    }


    return 'http://127.0.0.1:4416'
}


export const getYtDlpPath = () => {

    if (
        process.env.YTDLP_PATH
    ) {

        if (
            !existsSync(
                process.env.YTDLP_PATH
            )
        ) {

            throw new Error(
                `[YTDLP] YTDLP_PATH does not exist: ${process.env.YTDLP_PATH}`
            )
        }


        return process.env.YTDLP_PATH
    }


    const projectBinary =
        process.platform === 'win32'
            ? path.join(
                process.cwd(),
                'media-tools',
                'yt-dlp.exe'
            )
            : path.join(
                process.cwd(),
                'media-tools',
                'yt-dlp'
            )


    if (
        existsSync(projectBinary)
    ) {

        return projectBinary
    }


    throw new Error(
        `[YTDLP] Binary not found: ${projectBinary}`
    )
}


const getBgutilPluginPath = () => {

    const pluginPath =
        path.join(
            process.cwd(),
            'bgutil-ytdlp-pot-provider',
            'plugin'
        )


    if (
        !existsSync(pluginPath)
    ) {

        throw new Error(
            `[BGUTIL] Plugin directory not found: ${pluginPath}`
        )
    }


    return pluginPath
}


export const runYtDlp = async (
    args: string[]
) => {

    /*
     * DEV:
     * запускает локальный bgutil,
     * если его ещё нет.

     * PROD:
     * прогревает / проверяет
     * отдельный Vercel Service.
     */

    await ensureBgutilRunning()


    const ytDlpPath =
        getYtDlpPath()


    const pluginPath =
        getBgutilPluginPath()


    const bgutilUrl =
        getBgutilUrl()


    const finalArgs = [

        '--plugin-dirs',
        pluginPath,

        '--extractor-args',
        `youtubepot-bgutilhttp:base_url=${bgutilUrl}`,

        ...args
    ]


    console.log(
        '[YTDLP] Binary:',
        ytDlpPath
    )

    console.log(
        '[YTDLP] BGUTIL:',
        bgutilUrl
    )


    try {

        const result =
            await execFileAsync(
                ytDlpPath,
                finalArgs,
                {
                    maxBuffer:
                        50 * 1024 * 1024
                }
            )


        return result

    } catch (
        error: any
        ) {

        console.error(
            '[YTDLP ERROR]',
            error?.stderr ||
            error?.message ||
            error
        )


        throw error
    }
}
