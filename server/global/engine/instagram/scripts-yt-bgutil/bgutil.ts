import {spawn} from 'node:child_process'
import {access} from 'node:fs/promises'
import path from 'node:path'


const LOCAL_BGUTIL_URL =
    'http://127.0.0.1:4416'


const getBgutilUrl = () => {

    const configured =
        process.env.BGUTIL_URL?.trim()


    if (configured) {

        return configured.replace(
            /\/$/,
            ''
        )
    }


    if (
        process.env.VERCEL === '1'
    ) {

        throw new Error(
            '[BGUTIL] BGUTIL_URL is missing in Vercel production'
        )
    }


    return LOCAL_BGUTIL_URL
}


const pingBgutil = async (
    timeout = 30_000
) => {

    const url =
        `${getBgutilUrl()}/ping`


    const response =
        await fetch(
            url,
            {
                signal:
                    AbortSignal.timeout(timeout)
            }
        )


    if (!response.ok) {

        throw new Error(
            `[BGUTIL] /ping returned HTTP ${response.status}`
        )
    }


    const data =
        await response.json()


    return data
}


export const ensureBgutilRunning = async () => {

    /*
     * Production.
     *
     * bgutil является отдельным
     * Vercel Service.
     *
     * Никакого spawn().
     *
     * Первый fetch может разбудить
     * холодный container instance.
     */

    if (
        process.env.VERCEL === '1'
    ) {

        const data =
            await pingBgutil(30_000)

        console.log('[BGUTIL] Production ready:', data)
        return
    }


    /*
     * Local development.
     *
     * Здесь сохраняем старое поведение:
     * bgutil автоматически стартует
     * дочерним Node-процессом.
     */

    await ensureLocalBgutilRunning()
}


let bgutilProcess:
    ReturnType<typeof spawn> |
    null = null


let bgutilStarting:
    Promise<void> |
    null = null


const ensureLocalBgutilRunning =
    async () => {

        try {

            await pingBgutil(
                2_000
            )

            console.log(
                '[BGUTIL] Local already running'
            )

            return

        } catch {
            // запускаем ниже
        }


        if (
            bgutilStarting
        ) {

            await bgutilStarting

            return
        }


        bgutilStarting =
            new Promise<void>(
                async (
                    resolve,
                    reject
                ) => {

                    const mainPath =
                        path.join(
                            process.cwd(),
                            'bgutil-ytdlp-pot-provider',
                            'server',
                            'build',
                            'main.js'
                        )


                    try {

                        await access(
                            mainPath
                        )

                    } catch {

                        reject(
                            new Error(
                                `[BGUTIL] Local main.js not found: ${mainPath}`
                            )
                        )

                        return
                    }


                    console.log(
                        '[BGUTIL] Starting local:',
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
                                '4416'
                            ],
                            {
                                cwd:
                                    path.dirname(
                                        mainPath
                                    ),

                                stdio: [
                                    'ignore',
                                    'pipe',
                                    'pipe'
                                ],

                                detached:
                                    false
                            }
                        )


                    let settled =
                        false


                    const finishResolve =
                        () => {

                            if (
                                settled
                            ) return

                            settled = true

                            resolve()
                        }


                    const finishReject =
                        (
                            error: Error
                        ) => {

                            if (
                                settled
                            ) return

                            settled = true

                            reject(error)
                        }


                    bgutilProcess.once(
                        'error',
                        error => {

                            bgutilProcess =
                                null

                            finishReject(
                                error
                            )
                        }
                    )


                    bgutilProcess.once(
                        'exit',
                        (
                            code,
                            signal
                        ) => {

                            bgutilProcess =
                                null

                            if (
                                !settled
                            ) {

                                finishReject(
                                    new Error(
                                        `[BGUTIL] Local process exited before ready. code=${code}, signal=${signal}`
                                    )
                                )
                            }
                        }
                    )


                    bgutilProcess.stdout?.on(
                        'data',
                        data => {

                            console.log(
                                '[BGUTIL]',
                                data
                                    .toString()
                                    .trim()
                            )
                        }
                    )


                    bgutilProcess.stderr?.on(
                        'data',
                        data => {

                            console.error(
                                '[BGUTIL ERROR]',
                                data
                                    .toString()
                                    .trim()
                            )
                        }
                    )


                    const startedAt =
                        Date.now()


                    const check =
                        async () => {

                            try {

                                const data =
                                    await pingBgutil(
                                        2_000
                                    )


                                console.log(
                                    '[BGUTIL] Local ready:',
                                    data
                                )


                                finishResolve()

                                return

                            } catch {
                                // ещё не готов
                            }


                            if (
                                Date.now() -
                                startedAt >=
                                30_000
                            ) {

                                finishReject(
                                    new Error(
                                        '[BGUTIL] Local server did not become ready within 30 seconds'
                                    )
                                )

                                return
                            }


                            setTimeout(
                                () => {
                                    void check()
                                },
                                250
                            )
                        }


                    void check()
                }
            )


        try {

            await bgutilStarting

        } finally {

            bgutilStarting =
                null
        }
    }
