import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import path from 'node:path'
import {chmod, readFile, writeFile} from 'node:fs/promises'
import {existsSync} from 'node:fs'
import {ensureBgutilRunning} from "#server/global/engine/instagram/scripts-yt-bgutil/bgutil"


const YOUTUBE_COOKIES_PATH =
    '/tmp/youtube-cookies.txt'

const normalizeAndValidateYoutubeCookies = (
    value: string
) => {

    const cookies =
        value
            .replace(
                /^\uFEFF/,
                ''
            )
            .replace(
                /\r\n/g,
                '\n'
            )
            .replace(
                /\r/g,
                '\n'
            )

    const lines =
        cookies.split('\n')

    const firstLine =
        lines[0]?.trim()


    if (
        firstLine !== '# Netscape HTTP Cookie File' &&
        firstLine !== '# HTTP Cookie File'
    ) {

        throw new Error(
            '[YOUTUBE COOKIES] Invalid Netscape cookie header'
        )
    }


    let cookieCount =
        0


    for (
        let i = 0;
        i < lines.length;
        i++
    ) {

        const line =
            lines[i]


        if (
            !line ||
            line.trim() === '' ||
            line.startsWith('#')
        ) {

            continue
        }


        const fields =
            line.split('\t')


        if (
            fields.length !== 7
        ) {

            throw new Error(
                `[YOUTUBE COOKIES] Invalid Netscape cookie line ${i + 1}: expected 7 tab-separated fields, got ${fields.length}`
            )
        }


        cookieCount++
    }


    if (
        cookieCount === 0
    ) {

        throw new Error(
            '[YOUTUBE COOKIES] Cookie file contains no cookies'
        )
    }


    return cookies.endsWith('\n')
        ? cookies
        : `${cookies}\n`
}


const decodeYoutubeCookies =
    (
        value: string
    ) => {

        const trimmed =
            value.trim()


        /*
         * Позволяем передать обычный
         * Netscape cookies.txt.
         *
         * Это удобно как защита от
         * неправильного значения env.
         */

        if (
            trimmed.startsWith(
                '# Netscape HTTP Cookie File'
            ) ||
            trimmed.startsWith(
                '# HTTP Cookie File'
            )
        ) {

            console.warn(
                '[YOUTUBE COOKIES] Environment variable contains plain Netscape cookies, not Base64'
            )

            return normalizeAndValidateYoutubeCookies(
                trimmed
            )
        }


        /*
         * Нормальный production-вариант:
         * env содержит Base64.
         */

        let decoded: string

        try {

            decoded =
                Buffer
                    .from(
                        trimmed,
                        'base64'
                    )
                    .toString(
                        'utf8'
                    )

        } catch (
            error
            ) {

            throw new Error(
                `[YOUTUBE COOKIES] Base64 decode failed: ${error}`
            )
        }


        return normalizeAndValidateYoutubeCookies(
            decoded
        )
    }


const prepareYoutubeCookies =
    async () => {

        const value =
            process.env.YOUTUBE_COOKIES_B64?.trim()


        if (
            !value
        ) {

            console.log(
                '[YOUTUBE COOKIES] Not configured'
            )

            return []
        }


        /*
         * Если файл уже существует,
         * пытаемся использовать его.
         *
         * Это важно для Vercel warm instance.
         */

        if (
            existsSync(
                YOUTUBE_COOKIES_PATH
            )
        ) {

            try {

                const existing =
                    await readFile(
                        YOUTUBE_COOKIES_PATH,
                        'utf8'
                    )


                normalizeAndValidateYoutubeCookies(
                    existing
                )


                console.log(
                    '[YOUTUBE COOKIES] Existing file is valid'
                )


                return [
                    '--cookies',
                    YOUTUBE_COOKIES_PATH
                ]

            } catch {

                console.warn(
                    '[YOUTUBE COOKIES] Existing file is invalid, recreating'
                )
            }
        }


        const cookies =
            decodeYoutubeCookies(
                value
            )


        await writeFile(
            YOUTUBE_COOKIES_PATH,
            cookies,
            'utf8'
        )


        await chmod(
            YOUTUBE_COOKIES_PATH,
            0o600
        )


        const cookieCount =
            cookies
                .split('\n')
                .filter(
                    line =>
                        line &&
                        !line.startsWith('#')
                )
                .length


        console.log(
            '[YOUTUBE COOKIES] Prepared:',
            {
                path:
                YOUTUBE_COOKIES_PATH,

                cookieCount
            }
        )


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
        'youtube:player_client=mweb,tv,web_safari',

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
