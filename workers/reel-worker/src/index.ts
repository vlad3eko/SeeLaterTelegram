import {randomUUID} from 'node:crypto'
import process from 'node:process'
import {
    setInterval,
    clearInterval
} from 'node:timers'
import {createClient} from "@supabase/supabase-js";
import {
    finishReelPhase,
    prepareReel,
    prepareReelCleanPhase,
    prepareReelHookOptionsPhase
} from "../../../server/global/engine/instagram/reel/prepareReel";

type JsonRecord = Record<string, unknown>

/**
 * Что делает этот запуск (reel_processing_jobs.worker_phase, см. TASKS.md):
 * full — всё сразу (публикация без проверки);
 * clean — clean и превью, затем ожидание проверки администратором;
 * hooks — варианты хука по текущему clean, затем ожидание выбора;
 * finish — Reel с выбранным хуком (или с хуком от Gemini, если время выбора истекло).
 */
type WorkerPhase = 'full' | 'clean' | 'hooks' | 'finish'

type ReelJob = {
    id: string
    media_id: number | string
    media_type: string
    content_type: string
    key_trailer: string
    input_payload: unknown
    worker_phase?: string | null
    clean_variant?: number | null
    clean_preview_r2_url?: string | null
}

type ReelInputPayload = {
    /** Шаблонный хук; после ответа Gemini в ветке без проверки — хук Gemini. */
    hook?: string
    /** Хук, выбранный администратором кнопкой 1–4 (фаза finish). */
    chosenHook?: string | null
    /** clip — нарезка: исходник в R2 не удаляется до полной публикации. */
    videoType?: 'trailer' | 'clip'
    finalizerToken?: string
    finalizerUrl?: string
    content?: {
        title?: string
        overview?: string
        genre?: string | Array<{id?: number; name?: string} | string>
        rating?: number | string
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

// Cloud Run убивает задачу по task-timeout без единой строки в логе приложения: job навсегда остаётся
// в processing, а администратор не получает никакого сообщения. Сторожевой таймер срабатывает раньше
// (task-timeout у job — 1800 с), помечает job как failed и вызывает финализатор: Telegram-публикация
// без Reel и сообщение администратору, как при любой другой ошибке worker.
// REEL_WORKER_DEADLINE_MS: 2–55 минут, по умолчанию 25. Держите значение меньше task-timeout.
const DEFAULT_DEADLINE_MS = 25 * 60 * 1000

const readDeadlineMs = (): number => {
    const raw = process.env['REEL_WORKER_DEADLINE_MS']?.trim()
    const value = raw ? Number(raw) : Number.NaN

    return Number.isFinite(value) && value >= 2 * 60 * 1000 && value <= 55 * 60 * 1000
        ? value
        : DEFAULT_DEADLINE_MS
}

// Сколько ждать решения администратора на шаге проверки (clean или выбор хука).
// Потом задача идёт дальше без него (эндпоинт expireReviews). REEL_REVIEW_TIMEOUT_MS: 10 мин – 7 суток.
const DEFAULT_REVIEW_TIMEOUT_MS = 24 * 60 * 60 * 1000

const readReviewTimeoutMs = (): number => {
    const raw = process.env['REEL_REVIEW_TIMEOUT_MS']?.trim()
    const value = raw ? Number(raw) : Number.NaN

    return Number.isFinite(value) && value >= 10 * 60 * 1000 && value <= 7 * 24 * 60 * 60 * 1000
        ? value
        : DEFAULT_REVIEW_TIMEOUT_MS
}

const readWorkerPhase = (value: unknown): WorkerPhase =>
    value === 'clean' || value === 'hooks' || value === 'finish' ? value : 'full'

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

    const phase = readWorkerPhase(claimedJob.worker_phase)
    const previousPreview = String(claimedJob.clean_preview_r2_url ?? '').trim()

    /**
     * Сбой запуска. В ветке без проверки и в финале — как раньше: `failed`, и финализатор
     * публикует пост только в Telegram. На шагах проверки сбой возвращает задачу к
     * прошлому clean (если он уже показывался): администратор видит ошибку и снова жмёт
     * «Пересобрать» или «Сгенерировать хук», ничего не публикуется без его выбора.
     */
    const markFailed = async (message: string): Promise<void> => {
        const canReturnToReview =
            (phase === 'hooks' || phase === 'clean') && Boolean(previousPreview)

        await updateOwnedJob(
            canReturnToReview
                ? {
                    status: 'awaiting_review',
                    step: 'clean_review',
                    worker_phase: 'clean',
                    clean_preview_r2_url: previousPreview,
                    hook_options: null,
                    last_error: message,
                    review_expires_at: new Date(Date.now() + readReviewTimeoutMs()).toISOString(),
                    lease_token: null,
                    lease_expires_at: null
                }
                : {
                    status: 'failed',
                    step: 'failed',
                    last_error: message,
                    failed_at: new Date().toISOString(),
                    lease_token: null,
                    lease_expires_at: null
                }
        )

        if (canReturnToReview) {
            console.warn('[REEL REVIEW PHASE FAILED] Returned to the clean review', {jobId, phase})
        }
    }

    const deadlineMs = readDeadlineMs()
    const deadline = setTimeout(async () => {
        const message = `[WORKER DEADLINE] The job did not finish in ${Math.round(deadlineMs / 1000)} s ` +
            'and was stopped by the worker before the Cloud Run task timeout.'

        console.error('[REEL WORKER DEADLINE]', {jobId, deadlineMs, phase})

        try {
            await markFailed(message)
            clearInterval(heartbeat)
            await notifyFinalizer(jobId, failureFinalizerUrl, failureFinalizerToken)
        } catch (error) {
            console.error('[REEL WORKER DEADLINE HANDLING ERROR]', error)
        } finally {
            process.exit(1)
        }
    }, deadlineMs)

    // Снять lease и сторожевой таймер, затем позвать финализатор: он публикует (ready)
    // или присылает администратору сообщение проверки (awaiting_review).
    const handOver = async (input: ReelInputPayload): Promise<void> => {
        clearInterval(heartbeat)
        clearTimeout(deadline)

        await notifyFinalizer(
            jobId,
            typeof input.finalizerUrl === 'string' ? input.finalizerUrl : undefined,
            typeof input.finalizerToken === 'string' ? input.finalizerToken : undefined
        )
    }

    const awaitReview = async (patch: Record<string, unknown>): Promise<void> => {
        await updateOwnedJob({
            status: 'awaiting_review',
            ...patch,
            review_expires_at: new Date(Date.now() + readReviewTimeoutMs()).toISOString(),
            lease_token: null,
            lease_expires_at: null,
            last_error: null
        })
    }

    const markReady = async (keyTrailer: string, cleanR2: string, reelR2: string): Promise<void> => {
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
                completedAt: new Date().toISOString()
            },

            ready_at: new Date().toISOString(),
            review_expires_at: null,
            lease_token: null,
            lease_expires_at: null,
            last_error: null
        })

        console.log('[REEL WORKER READY]', {jobId, cleanR2})
    }

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
        if (mediaType !== 'movie' && mediaType !== 'tv') {
            throw new Error(`[JOB INPUT] Invalid media_type: ${mediaType}`)
        }

        await updateOwnedJob({step: 'rendering'})

        const content = {
            id: mediaId,
            type: mediaType,
            title: contentInput?.title,
            overview: contentInput?.overview,
            genre: contentInput?.genre,
            rating: contentInput?.rating
        }

        console.log('[REEL WORKER PROCESSING]', {
            jobId,
            phase,
            mediaId,
            mediaType,
            contentType: claimedJob.content_type,
            keyTrailer
        })

        // Хук от Gemini (ветка без проверки или истёкший выбор) сохраняется в задачу.
        const onHookGenerated = async (generatedHook: string) => {
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

        if (phase === 'clean') {
            const segmentVariant = Math.max(0, Number(claimedJob.clean_variant ?? 0) || 0)

            const {cleanR2, previewR2} = await prepareReelCleanPhase({
                keyTrailer,
                content,
                segmentVariant,
                // Первый показ может взять clean из кэша; «Пересобрать» увеличивает вариант.
                rebuild: segmentVariant > 0
            })

            await awaitReview({
                step: 'clean_review',
                clean_r2_url: cleanR2,
                clean_preview_r2_url: previewR2,
                hook_options: null
            })

            console.log('[REEL WORKER CLEAN READY FOR REVIEW]', {jobId, segmentVariant, cleanR2})
            await handOver(input)
            return
        }

        if (phase === 'hooks') {
            const options = await prepareReelHookOptionsPhase({keyTrailer, content})

            await awaitReview({
                step: 'hook_choice',
                hook_options: options
            })

            console.log('[REEL WORKER HOOK OPTIONS READY]', {jobId, options})
            await handOver(input)
            return
        }

        const chosenHook = phase === 'finish' && typeof input.chosenHook === 'string'
            ? input.chosenHook.trim()
            : ''

        const prepared = phase === 'finish'
            ? await finishReelPhase({
                keyTrailer,
                content,
                chosenHook: chosenHook || undefined,
                fallbackHook: hook,
                keepSource: input.videoType === 'clip',
                options: {onHookGenerated}
            })
            : await prepareReel(keyTrailer, hook, content, {onHookGenerated})

        if (chosenHook) {
            // Хук администратора ложится туда же, где лежит хук Gemini у остальных задач.
            await updateOwnedJob({input_payload: {...input, hook: chosenHook}})
            input.hook = chosenHook
        }

        await markReady(
            keyTrailer,
            String(prepared?.cleanR2 ?? '').trim(),
            String(prepared?.reelR2 ?? '').trim()
        )

        // После снятия lease worker больше не должен обновлять его heartbeat,
        // а сторожевой таймер не должен помечать подготовленный job как failed.
        await handOver(input)
    } catch (error) {
        const message = getErrorMessage(error).slice(0, 12_000)
        console.error('[REEL WORKER FAILED]', {jobId, phase, error: message})

        try {
            await markFailed(message)
            clearInterval(heartbeat)
            await notifyFinalizer(jobId, failureFinalizerUrl, failureFinalizerToken)
        } catch (updateError) {
            console.error('[REEL WORKER FAILED-STATUS UPDATE ERROR]', updateError)
        }

        throw error
    } finally {
        clearInterval(heartbeat)
        clearTimeout(deadline)
    }
}

main().catch(error => {
    console.error('[REEL WORKER FATAL]', error)
    process.exitCode = 1
})
