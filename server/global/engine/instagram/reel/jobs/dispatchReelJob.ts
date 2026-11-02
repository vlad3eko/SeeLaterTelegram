import {createSign, randomBytes} from 'node:crypto'
import {createClient} from '@supabase/supabase-js'
import {createInstagramHook} from "#server/global/engine/instagram/reel/caption/createInstagramHook";
import {createInstagramCaption} from "#server/global/engine/instagram/reel/caption/createInstagramCaption";
import type {ContentType} from "#server/global/engine/search/strategy/enums";

type ReelSessionSnapshot = {
    media: any
    mediaId: number
    mediaType: 'movie' | 'tv'
    contentType: string
    keyTrailer: string
    comment?: string
    overview?: string
    currentMedia: {
        type: 'photo' | 'video'
        fileId: string
    }
    inlineMessageId?: string
    publishStartedAt?: number
    isRichTypeCard: boolean
}

type DispatchReelJobInput = {
    adminTelegramId: number
    sourceUpdateId: number
    channelChatId: string
    finalizerUrl: string
    session: ReelSessionSnapshot
}

type JobRow = {
    id: string
    status: string
    step: string
    worker_execution_name?: string | null
    lease_expires_at?: string | null
    input_payload?: Record<string, any> | null
}

const requiredEnv = (name: string): string => {
    const value = process.env[name]?.trim()
    if (!value) throw new Error(`[CLOUD RUN CONFIG] ${name} is required`)
    return value
}

const getSupabase = () => createClient(
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

const encodeBase64Url = (value: string | Buffer): string =>
    Buffer.from(value).toString('base64url')

const getGoogleAccessToken = async (): Promise<string> => {
    const encodedCredentials = requiredEnv('GCP_SERVICE_ACCOUNT_JSON_B64')
    let credentials: {
        type?: string
        client_email?: string
        private_key?: string
        token_uri?: string
    }

    try {
        credentials = JSON.parse(
            Buffer.from(encodedCredentials, 'base64').toString('utf8')
        )
    } catch {
        throw new Error('[CLOUD RUN AUTH] GCP_SERVICE_ACCOUNT_JSON_B64 is not valid Base64 JSON')
    }

    if (!credentials.client_email || !credentials.private_key) {
        throw new Error('[CLOUD RUN AUTH] Service account JSON is missing client_email or private_key')
    }

    const now = Math.floor(Date.now() / 1000)
    const header = encodeBase64Url(JSON.stringify({alg: 'RS256', typ: 'JWT'}))
    const payload = encodeBase64Url(JSON.stringify({
        iss: credentials.client_email,
        scope: 'https://www.googleapis.com/auth/cloud-platform',
        aud: credentials.token_uri || 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600
    }))
    const unsignedToken = `${header}.${payload}`

    const signer = createSign('RSA-SHA256')
    signer.update(unsignedToken)
    signer.end()

    const privateKey = credentials.private_key.replace(/\\n/g, '\n')
    const assertion = `${unsignedToken}.${signer.sign(privateKey).toString('base64url')}`
    const tokenUri = credentials.token_uri || 'https://oauth2.googleapis.com/token'

    const response = await fetch(tokenUri, {
        method: 'POST',
        headers: {'content-type': 'application/x-www-form-urlencoded'},
        body: new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion
        })
    })

    const result = await response.json() as {
        access_token?: string
        error?: string
        error_description?: string
    }

    if (!response.ok || !result.access_token) {
        throw new Error(
            `[CLOUD RUN AUTH] OAuth token request failed: ${result.error_description || result.error || response.status}`
        )
    }

    return result.access_token
}

const runCloudRunJob = async (jobId: string): Promise<string | null> => {
    const accessToken = await getGoogleAccessToken()
    const projectId = 'kinomanov-reels-worker'
    const region = 'europe-west3'
    const jobName = 'kinomanov-reel-worker'
    const url = `https://run.googleapis.com/v2/projects/${projectId}/locations/${region}/jobs/${jobName}:run`

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            authorization: `Bearer ${accessToken}`,
            'content-type': 'application/json'
        },
        body: JSON.stringify({
            overrides: {
                containerOverrides: [{
                    env: [{name: 'REEL_JOB_ID', value: jobId}]
                }],
                taskCount: 1
            }
        })
    })

    const result = await response.json() as {
        name?: string
        error?: {message?: string; status?: string}
    }

    if (!response.ok) {
        throw new Error(
            `[CLOUD RUN DISPATCH] ${result.error?.status || response.status}: ${result.error?.message || 'Job execution request failed'}`
        )
    }

    return result.name ?? null
}

const callFinalizer = async (
    finalizerUrl: string,
    jobId: string,
    callbackToken: string
): Promise<void> => {
    const response = await fetch(finalizerUrl, {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({jobId, callbackToken})
    })

    const responseText = await response.text()
    if (!response.ok) {
        throw new Error(`[REEL FINALIZER RETRY] HTTP ${response.status}: ${responseText.slice(0, 1000)}`)
    }
}

const startQueuedJob = async (
    supabase: ReturnType<typeof getSupabase>,
    job: JobRow
): Promise<void> => {
    const operationName = await runCloudRunJob(job.id)

    if (operationName) {
        const {error} = await supabase
            .from('reel_processing_jobs')
            .update({
                worker_execution_name: operationName,
                last_error: null
            })
            .eq('id', job.id)
            .eq('status', 'queued')

        if (error) {
            // Запуск уже принят Cloud Run. Ошибка записи operation name не должна
            // превращать успешно запущенную задачу в failed.
            console.error('[REEL JOB OPERATION SAVE ERROR]', error)
        }
    }
}

export const dispatchReelJob = async ({
    adminTelegramId,
    sourceUpdateId,
    channelChatId,
    finalizerUrl,
    session
}: DispatchReelJobInput): Promise<{
    jobId: string
    status: string
    reused: boolean
}> => {
    if (!Number.isSafeInteger(adminTelegramId) || adminTelegramId <= 0) {
        throw new Error('[REEL JOB INPUT] Invalid adminTelegramId')
    }
    if (!Number.isSafeInteger(sourceUpdateId) || sourceUpdateId < 0) {
        throw new Error('[REEL JOB INPUT] Invalid sourceUpdateId')
    }
    if (!session.keyTrailer?.trim()) {
        throw new Error('[REEL JOB INPUT] keyTrailer is required')
    }
    if (!/^https:\/\//i.test(finalizerUrl)) {
        throw new Error('[REEL JOB INPUT] finalizerUrl must use HTTPS')
    }

    const supabase = getSupabase()
    const callbackToken = randomBytes(32).toString('hex')
    const instagramCaption = createInstagramCaption({
        media: session.media,
        comment: session.comment,
        overview: session.overview,
        contentType: session.contentType
    })

    const inputPayload = {
        hook: createInstagramHook(session.mediaType, session.contentType as ContentType),
        content: {
            title: session.media?.title || session.media?.name,
            overview: session.overview || session.media?.overview,
            genre: session.media?.genres ?? [],
            rating: session.media?.vote_average ?? session.media?.rating ?? '-'
        },
        session: {
            media: session.media,
            mediaId: session.mediaId,
            mediaType: session.mediaType,
            contentType: session.contentType,
            keyTrailer: session.keyTrailer,
            comment: session.comment ?? null,
            overview: session.overview ?? null,
            currentMedia: session.currentMedia,
            inlineMessageId: session.inlineMessageId ?? null,
            publishStartedAt: session.publishStartedAt ?? null,
            isRichTypeCard: session.isRichTypeCard
        },
        finalizerToken: callbackToken,
        finalizerUrl
    }

    // Защищает от повторного нажатия той же кнопки или повторной доставки webhook.
    // Для активной задачи повторно не создаём строку и не запускаем второй worker.
    const {data: activeJob, error: activeJobError} = await supabase
        .from('reel_processing_jobs')
        .select('id,status,step,worker_execution_name,lease_expires_at,input_payload')
        .eq('admin_telegram_id', adminTelegramId)
        .eq('media_id', session.mediaId)
        .eq('media_type', session.mediaType)
        .eq('content_type', session.contentType)
        .eq('key_trailer', session.keyTrailer)
        .in('status', ['queued', 'processing', 'ready', 'publishing'])
        .order('created_at', {ascending: false})
        .limit(1)
        .maybeSingle()

    if (activeJobError) {
        throw new Error(`[REEL JOB LOOKUP ERROR] ${activeJobError.message}`)
    }

    if (activeJob) {
        const active = activeJob as JobRow

        if (active.status === 'queued') {
            // Повторный запуск безопасен: claim_reel_processing_job атомарно
            // разрешает обработку только одному worker. Это также восстанавливает
            // queued-задачи, если Cloud Run принял execution, но его запуск сорвался.
            await startQueuedJob(supabase, active)
        } else if (
            active.status === 'processing' &&
            (!active.lease_expires_at || new Date(active.lease_expires_at).getTime() < Date.now())
        ) {
            // У Cloud Run Job maxRetries=0: после аварии контейнера просроченная
            // processing-задача должна получить новый execution при повторном клике.
            await startQueuedJob(supabase, active)
        } else if (active.status === 'ready') {
            const token = String(active.input_payload?.finalizerToken ?? '')
            const url = String(active.input_payload?.finalizerUrl ?? finalizerUrl)
            if (token) await callFinalizer(url, active.id, token)
        } else if (
            active.status === 'publishing' &&
            (!active.lease_expires_at || new Date(active.lease_expires_at).getTime() < Date.now())
        ) {
            const token = String(active.input_payload?.finalizerToken ?? '')
            const url = String(active.input_payload?.finalizerUrl ?? finalizerUrl)
            if (token) await callFinalizer(url, active.id, token)
        }

        return {
            jobId: active.id,
            status: active.status,
            reused: true
        }
    }

    // Если worker или финализатор завершился с ошибкой, повторяем ту же задачу.
    // Для worker failure финализатор сохранит старое поведение: Telegram-only fallback.
    const {data: failedPublication, error: failedLookupError} = await supabase
        .from('reel_processing_jobs')
        .select('id,status,step,lease_expires_at,input_payload')
        .eq('admin_telegram_id', adminTelegramId)
        .eq('media_id', session.mediaId)
        .eq('media_type', session.mediaType)
        .eq('content_type', session.contentType)
        .eq('key_trailer', session.keyTrailer)
        .eq('status', 'failed')
        .order('created_at', {ascending: false})
        .limit(1)
        .maybeSingle()

    if (failedLookupError) {
        throw new Error(`[REEL FAILED JOB LOOKUP ERROR] ${failedLookupError.message}`)
    }

    if (failedPublication) {
        const failedJob = failedPublication as JobRow
        const token = String(failedJob.input_payload?.finalizerToken ?? '')
        const url = String(failedJob.input_payload?.finalizerUrl ?? finalizerUrl)
        if (!token) throw new Error('[REEL FINALIZER RETRY] Callback token is missing')
        await callFinalizer(url, failedJob.id, token)
        return {jobId: failedJob.id, status: 'finalizing', reused: true}
    }

    const {data: insertedJob, error: insertError} = await supabase
        .from('reel_processing_jobs')
        .insert({
            source_update_id: sourceUpdateId,
            admin_telegram_id: adminTelegramId,
            media_id: session.mediaId,
            media_type: session.mediaType,
            content_type: session.contentType,
            key_trailer: session.keyTrailer,
            input_payload: inputPayload,
            instagram_caption: instagramCaption,
            channel_chat_id: channelChatId,
            status: 'queued',
            step: 'queued'
        })
        .select('id,status,step,worker_execution_name')
        .single()

    if (insertError) {
        if (insertError.code === '23505') {
            // source_update_id защищает от повторного создания одного и того же job.
            const {data: existing, error: existingError} = await supabase
                .from('reel_processing_jobs')
                .select('id,status,step,worker_execution_name,lease_expires_at,input_payload')
                .eq('source_update_id', sourceUpdateId)
                .maybeSingle()

            if (existingError || !existing) {
                throw new Error(`[REEL JOB DUPLICATE LOOKUP ERROR] ${existingError?.message || 'Existing job not found'}`)
            }

            const existingJob = existing as JobRow
            if (existingJob.status === 'queued') {
                await startQueuedJob(supabase, existingJob)
            } else if (
                existingJob.status === 'processing' &&
                (!existingJob.lease_expires_at || new Date(existingJob.lease_expires_at).getTime() < Date.now())
            ) {
                await startQueuedJob(supabase, existingJob)
            } else if (existingJob.status === 'ready') {
                const token = String(existingJob.input_payload?.finalizerToken ?? '')
                const url = String(existingJob.input_payload?.finalizerUrl ?? finalizerUrl)
                if (token) await callFinalizer(url, existingJob.id, token)
            }

            return {
                jobId: existingJob.id,
                status: existingJob.status,
                reused: true
            }
        }

        throw new Error(`[REEL JOB INSERT ERROR] ${insertError.message}`)
    }

    const job = insertedJob as JobRow
    await startQueuedJob(supabase, job)

    console.log('[REEL JOB DISPATCHED]', {
        jobId: job.id,
        sourceUpdateId,
        mediaId: session.mediaId,
        mediaType: session.mediaType
    })

    return {
        jobId: job.id,
        status: 'queued',
        reused: false
    }
}
