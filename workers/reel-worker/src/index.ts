import {randomUUID} from 'node:crypto'
import {existsSync} from 'node:fs'
import process from 'node:process'
import {
    setInterval,
    clearInterval
} from 'node:timers'
import {createClient} from "@supabase/supabase-js";
import {prepareReel} from "../../../server/global/engine/instagram/reel/prepareReel";

type JsonRecord = Record<string, unknown>

type ReelJob = {
    id: string
    media_id: number | string
    media_type: string
    content_type: string
    key_trailer: string
    input_payload: unknown
}

type ReelInputPayload = {
    hook?: string
    finalizerToken?: string
    finalizerUrl?: string
    content?: {
        title?: string
        overview?: string
        genre?: string | Array<{id?: number; name?: string} | string>
        rating?: number | string
        subtitlesPath?: string
        highlightWord?: string
    }
}

const requiredEnv = (name: string): string => {
    const value = process.env[name]?.trim()
    if (!value) {
        throw new Error(`[CONFIG] ${name} is required`)
    }
    return value
}

const asRecord = (value: unknown, fieldName: string): JsonRecord => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`[JOB INPUT] ${fieldName} must be an object`)
    }
    return value as JsonRecord
}

const getErrorMessage = (error: unknown): string => {
    if (error instanceof Error) {
        return `${error.name}: ${error.message}${error.stack ? `\n${error.stack}` : ''}`
    }
    return String(error)
}


const notifyFinalizer = async (
    jobId: string,
    finalizerUrl: string | undefined,
    callbackToken: string | undefined
): Promise<void> => {
    if (!finalizerUrl || !callbackToken) {
        console.warn('[REEL FINALIZER CALLBACK SKIPPED] Callback URL or token is missing', {jobId})
        return
    }

    let lastError: unknown

    // 202 означает, что другой запрос уже держит lease и завершает публикацию.
    // Ожидаем его результат; если Vercel оборвал запрос, истечение lease позволит
    // следующей попытке забрать задачу повторно.
    for (let attempt = 1; attempt <= 24; attempt++) {
        try {
            const response = await fetch(finalizerUrl, {
                method: 'POST',
                headers: {'content-type': 'application/json'},
                body: JSON.stringify({jobId, callbackToken})
            })

            const responseText = await response.text()

            if (response.status === 202) {
                console.log('[REEL FINALIZER CALLBACK IN PROGRESS]', {jobId, attempt})
                await new Promise(resolve => setTimeout(resolve, 10_000))
                continue
            }

            if (response.ok) {
                console.log('[REEL FINALIZER CALLBACK DONE]', {jobId, status: response.status})
                return
            }

            lastError = new Error(`HTTP ${response.status}: ${responseText.slice(0, 1000)}`)
            console.error('[REEL FINALIZER CALLBACK ERROR]', {jobId, attempt, error: lastError})

            if (response.status >= 400 && response.status < 500 && response.status !== 409) {
                break
            }
        } catch (error) {
            lastError = error
            console.error('[REEL FINALIZER CALLBACK REQUEST ERROR]', {jobId, attempt, error})
        }

        if (attempt < 24) {
            await new Promise(resolve => setTimeout(resolve, 10_000))
        }
    }

    // Подготовка уже находится в status=ready. Сбой HTTP-уведомления не должен
    // переводить успешно подготовленный Reel обратно в failed.
    console.error('[REEL FINALIZER CALLBACK EXHAUSTED]', {jobId, error: getErrorMessage(lastError)})
}

const main = async (): Promise<void> => {
    const jobId = requiredEnv('REEL_JOB_ID')
    const supabase = createClient(
        requiredEnv('SUPABASE_URL'),
        requiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
        {
            auth: {
                autoRefreshToken: false,
                persistSession: false,
                detectSessionInUrl: false
            }
        }
    )

    const leaseToken = randomUUID()
    const leaseSeconds = 600

    console.log('[REEL WORKER START]', {
        jobId,
        execution: process.env['CLOUD_RUN_EXECUTION'] ?? null,
        taskIndex: process.env['CLOUD_RUN_TASK_INDEX'] ?? null
    })

    const {data: claimedData, error: claimError} = await supabase.rpc(
        'claim_reel_processing_job',
        {
            p_job_id: jobId,
            p_lease_token: leaseToken,
            p_lease_seconds: leaseSeconds
        }
    )

    if (claimError) {
        throw new Error(`[JOB CLAIM ERROR] ${claimError.message}`)
    }

    const claimedJob = Array.isArray(claimedData)
        ? claimedData[0] as ReelJob | undefined
        : claimedData as ReelJob | null

    if (!claimedJob) {
        console.log('[REEL WORKER SKIP] Job is not queued or its processing lease is still active', {jobId})
        return
    }

    const updateOwnedJob = async (patch: Record<string, unknown>): Promise<void> => {
        const {data, error} = await supabase
            .from('reel_processing_jobs')
            .update(patch)
            .eq('id', jobId)
            .eq('lease_token', leaseToken)
            .select('id')
            .maybeSingle()

        if (error) {
            throw new Error(`[JOB UPDATE ERROR] ${error.message}`)
        }
        if (!data) {
            throw new Error('[JOB LEASE LOST] This worker no longer owns the job')
        }
    }

    let heartbeatBusy = false
    let heartbeatFailed = false

    const heartbeat = setInterval(async () => {
        if (heartbeatBusy || heartbeatFailed) return
        heartbeatBusy = true

        try {
            await updateOwnedJob({
                lease_expires_at: new Date(Date.now() + leaseSeconds * 1000).toISOString()
            })
        } catch (error) {
            heartbeatFailed = true
            console.error('[JOB HEARTBEAT ERROR]', error)
        } finally {
            heartbeatBusy = false
        }
    }, 90_000)

    heartbeat.unref()

    let failureFinalizerUrl: string | undefined
    let failureFinalizerToken: string | undefined

    try {
        const input = asRecord(claimedJob.input_payload, 'input_payload') as ReelInputPayload
        failureFinalizerUrl = typeof input.finalizerUrl === 'string' ? input.finalizerUrl : undefined
        failureFinalizerToken = typeof input.finalizerToken === 'string' ? input.finalizerToken : undefined
        const contentInput = asRecord(input.content, 'input_payload.content') as ReelInputPayload['content']
        const keyTrailer = String(claimedJob.key_trailer ?? '').trim()
        const hook = String(input.hook ?? '').trim()
        const mediaId = Number(claimedJob.media_id)
        const mediaType = String(claimedJob.media_type ?? '').trim()

        if (!keyTrailer) throw new Error('[JOB INPUT] key_trailer is missing')
        if (!hook) throw new Error('[JOB INPUT] input_payload.hook is missing')
        if (!Number.isSafeInteger(mediaId) || mediaId <= 0) {
            throw new Error(`[JOB INPUT] Invalid media_id: ${claimedJob.media_id}`)
        }
        if (!mediaType) throw new Error('[JOB INPUT] media_type is missing')

        // subtitlesPath — это локальный путь внутри worker-контейнера.
        // Путь с Vercel или компьютера администратора здесь использовать нельзя.
        if (contentInput?.subtitlesPath && !existsSync(contentInput.subtitlesPath)) {
            throw new Error(
                `[JOB INPUT] subtitlesPath does not exist in worker container: ${contentInput.subtitlesPath}`
            )
        }

        await updateOwnedJob({step: 'rendering'})

        const content = {
            id: mediaId,
            type: mediaType,
            title: contentInput?.title,
            overview: contentInput?.overview,
            genre: contentInput?.genre,
            rating: contentInput?.rating,
            subtitlesPath: contentInput?.subtitlesPath,
            highlightWord: contentInput?.highlightWord
        }

        console.log('[REEL WORKER PROCESSING]', {
            jobId,
            mediaId,
            mediaType,
            contentType: claimedJob.content_type,
            keyTrailer
        })

        const prepared = await prepareReel(
            keyTrailer,
            hook,
            undefined,
            content,
            'publish',
            {
                onHookGenerated: async (generatedHook: string) => {
                    const normalizedHook = generatedHook.trim()

                    if (!normalizedHook) {
                        throw new Error('[GEMINI] Generated hook is empty')
                    }

                    await updateOwnedJob({
                        input_payload: {
                            ...input,
                            hook: normalizedHook
                        }
                    })

                    input.hook = normalizedHook

                    console.log('[REEL JOB HOOK UPDATED]', {
                        jobId,
                        hook: normalizedHook
                    })
                }
            }
        )

        const cleanR2 = String(prepared?.cleanR2 ?? '').trim()
        const reelR2 = String(prepared?.reelR2 ?? '').trim()

        if (!cleanR2 || !/^https:\/\//i.test(cleanR2)) {
            throw new Error('[REEL PREPARE ERROR] Invalid cleanR2 URL')
        }

        if (!reelR2 || !/^https:\/\//i.test(reelR2)) {
            throw new Error('[REEL PREPARE ERROR] Invalid reelR2 URL')
        }

        await updateOwnedJob({
            status: 'ready',
            step: 'ready',

            clean_r2_url: cleanR2,

            // Временная ссылка нужна финализатору для Instagram.
            // После успешной публикации она будет очищена.
            instagram_publish_r2_url: reelR2,

            result_payload: {
                keyTrailer,
                cleanR2,
                telegramFileId: prepared.telegramFileId ?? null,
                completedAt: new Date().toISOString()
            },

            ready_at: new Date().toISOString(),
            lease_token: null,
            lease_expires_at: null,
            last_error: null
        })

        console.log('[REEL WORKER READY]', {
            jobId,
            cleanR2
        })

        // После снятия lease worker больше не должен обновлять его heartbeat.
        clearInterval(heartbeat)

        await notifyFinalizer(
            jobId,
            typeof input.finalizerUrl === 'string' ? input.finalizerUrl : undefined,
            typeof input.finalizerToken === 'string' ? input.finalizerToken : undefined
        )
    } catch (error) {
        const message = getErrorMessage(error).slice(0, 12_000)
        console.error('[REEL WORKER FAILED]', {jobId, error: message})

        try {
            await updateOwnedJob({
                status: 'failed',
                step: 'failed',
                last_error: message,
                failed_at: new Date().toISOString(),
                lease_token: null,
                lease_expires_at: null
            })
            clearInterval(heartbeat)
            await notifyFinalizer(jobId, failureFinalizerUrl, failureFinalizerToken)
        } catch (updateError) {
            console.error('[REEL WORKER FAILED-STATUS UPDATE ERROR]', updateError)
        }

        throw error
    } finally {
        clearInterval(heartbeat)
    }
}

main().catch(error => {
    console.error('[REEL WORKER FATAL]', error)
    process.exitCode = 1
})
