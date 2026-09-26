import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import path from 'node:path'
import {existsSync} from 'node:fs'
import {spawn} from 'node:child_process'

const execFileAsync = promisify(execFile)

const BGUTIL_PORT = 4416
const BGUTIL_URL = `http://127.0.0.1:${BGUTIL_PORT}`

let bgutilProcess: ReturnType<typeof import('node:child_process').spawn> | null = null
let bgutilStarting: Promise<void> | null = null

export const getYtDlpPath = () => {
    if (process.env.YTDLP_PATH) {
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

    if (existsSync(projectBinary)) {
        return projectBinary
    }

    return 'yt-dlp'
}

const getBgutilMainPath = () => {
    return path.join(
        process.cwd(),
        'bgutil-ytdlp-pot-provider',
        'server',
        'build',
        'main.js'
    )
}

const getBgutilPluginPath = () => {
    return path.join(
        process.cwd(),
        'bgutil-ytdlp-pot-provider',
        'plugin'
    )
}

const isBgutilRunning = async () => {
    try {
        const response = await fetch(
            BGUTIL_URL,
            {
                signal: AbortSignal.timeout(2000)
            }
        )

        return response.status >= 200 &&
            response.status < 500
    } catch {
        return false
    }
}

const startBgutil = async () => {
    if (await isBgutilRunning()) {
        console.log('[BGUTIL] Already running')
        return
    }

    if (bgutilStarting) {
        await bgutilStarting
        return
    }

    bgutilStarting = new Promise((resolve, reject) => {
        const mainPath = getBgutilMainPath()

        if (!existsSync(mainPath)) {
            reject(
                new Error(
                    `bgutil main.js not found: ${mainPath}`
                )
            )
            return
        }

        console.log(
            '[BGUTIL] Starting:',
            mainPath
        )

        bgutilProcess = spawn(
            process.execPath,
            [mainPath],
            {
                cwd: path.dirname(mainPath),
                stdio: ['ignore', 'pipe', 'pipe'],
                detached: false
            }
        )

        bgutilProcess.stdout?.on(
            'data',
            data => {
                console.log(
                    '[BGUTIL]',
                    data.toString().trim()
                )
            }
        )

        bgutilProcess.stderr?.on(
            'data',
            data => {
                console.error(
                    '[BGUTIL STDERR]',
                    data.toString().trim()
                )
            }
        )

        bgutilProcess.once(
            'error',
            error => {
                bgutilProcess = null
                bgutilStarting = null
                reject(error)
            }
        )

        const startedAt = Date.now()

        const checkReady = async () => {
            if (await isBgutilRunning()) {
                console.log(
                    `[BGUTIL] Ready after ${Date.now() - startedAt}ms`
                )

                resolve()
                return
            }

            if (Date.now() - startedAt >= 10_000) {
                reject(
                    new Error(
                        'bgutil server did not start on port 4416 within 10 seconds'
                    )
                )
                return
            }

            setTimeout(
                checkReady,
                250
            )
        }

        void checkReady()
    })

    try {
        await bgutilStarting
    } finally {
        bgutilStarting = null
    }
}

export const runYtDlp = async (
    args: string[]
) => {
    await startBgutil()

    const ytDlpPath = getYtDlpPath()
    const pluginPath = getBgutilPluginPath()

    const finalArgs = [
        '--plugin-dirs',
        pluginPath,

        '--extractor-args',
        `youtubepot-bgutilhttp:base_url=${BGUTIL_URL}`,

        ...args
    ]

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
    } catch (error: any) {
        console.error(
            '[YTDLP ERROR]',
            error?.stderr ||
            error?.message ||
            error
        )

        throw error
    }
}
