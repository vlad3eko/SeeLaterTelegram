import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import path from 'node:path'
import {existsSync} from 'node:fs'
import {writeFile} from 'node:fs/promises'
import {ensureBgutilRunning} from "#server/global/engine/instagram/scripts-yt-bgutil/bgutil"

const YOUTUBE_COOKIES_PATH =
    '/tmp/youtube-cookies.txt'


const prepareYoutubeCookies =
    async () => {

        const encoded =
            process.env.YOUTUBE_COOKIES_B64?.trim()


        if (
            !encoded
        ) {

            return []
        }


        if (
            !existsSync(
                YOUTUBE_COOKIES_PATH
            )
        ) {

            const cookies =
                Buffer
                    .from(
                        encoded,
                        'base64'
                    )
                    .toString(
                        'utf8'
                    )


            await writeFile(
                YOUTUBE_COOKIES_PATH,
                cookies,
                'utf8'
            )
        }


        return [
            '--cookies',
            YOUTUBE_COOKIES_PATH
        ]
    }


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

export const runYtDlp = async (
    args: string[]
) => {

    /*
     * DEV:
     * запускает локальный bgutil,
     * если его ещё нет.
     *
     * PROD:
     * прогревает / проверяет
     * отдельный Vercel Service.
     */

    await ensureBgutilRunning()


    const ytDlpPath =
        getYtDlpPath()

    const bgutilUrl =
        getBgutilUrl()

    const youtubeCookiesArgs =
        await prepareYoutubeCookies()

    const finalArgs = [

        '--verbose',

        '--js-runtimes',
        `node:${process.execPath}`,

        '--extractor-args',
        'youtube:player_client=mweb',

        '--extractor-args',
        `youtubepot-bgutilhttp:base_url=${bgutilUrl}`,

        ...youtubeCookiesArgs,
        ...args
    ]

    console.log(
        '[YTDLP] Binary:',
        ytDlpPath
    )

    console.log(
        '[YTDLP] JS runtime:',
        process.execPath
    )

    console.log(
        '[YTDLP] BGUTIL:',
        bgutilUrl
    )


    try {

        return await execFileAsync(
            ytDlpPath,
            finalArgs,
            {
                maxBuffer:
                    50 * 1024 * 1024
            }
        )

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
