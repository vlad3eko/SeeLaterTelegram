import {spawn} from 'node:child_process'
import {access} from 'node:fs/promises'
import path from 'node:path'

const BGUTIL_PORT = 4416

let bgutilProcess:
    ReturnType<typeof spawn> | null = null

let bgutilStarting:
    Promise<void> | null = null

const isBgutilAlive = async () => {
    try {
        const response =
            await fetch(
                `http://127.0.0.1:${BGUTIL_PORT}/`
            )

        return response.status < 500
    } catch {
        return false
    }
}

const getBgutilMainPath = () =>
    path.join(
        process.cwd(),
        'bgutil-ytdlp-pot-provider',
        'server',
        'build',
        'main.js'
    )

export const ensureBgutilRunning = async () => {
    if (
        await isBgutilAlive()
    ) {
        return
    }

    if (bgutilStarting) {
        await bgutilStarting
        return
    }

    bgutilStarting = (async () => {
        const mainPath =
            getBgutilMainPath()

        await access(mainPath)

        console.log(
            '[BGUTIL] Starting:',
            mainPath
        )

        bgutilProcess =
            spawn(
                process.execPath,
                [
                    mainPath,
                    '--host',
                    '127.0.0.1',
                    '--port',
                    String(BGUTIL_PORT)
                ],
                {
                    stdio: [
                        'ignore',
                        'pipe',
                        'pipe'
                    ]
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
                    '[BGUTIL ERROR]',
                    data.toString().trim()
                )
            }
        )

        bgutilProcess.on(
            'exit',
            (code, signal) => {
                console.log(
                    '[BGUTIL EXIT]',
                    {
                        code,
                        signal
                    }
                )

                bgutilProcess = null
            }
        )

        for (
            let attempt = 0;
            attempt < 30;
            attempt++
        ) {
            if (
                await isBgutilAlive()
            ) {
                console.log(
                    '[BGUTIL] Ready on',
                    `127.0.0.1:${BGUTIL_PORT}`
                )

                return
            }

            await new Promise(
                resolve =>
                    setTimeout(
                        resolve,
                        250
                    )
            )
        }

        throw new Error(
            'bgutil did not become ready'
        )
    })()

    try {
        await bgutilStarting
    } finally {
        bgutilStarting = null
    }
}
