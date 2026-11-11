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

/**
 * manual: ключ трейлера администратор ввёл сам — воркер останавливается на проверке clean
 * и выборе хука (см. TASKS.md). auto: всё за один проход, хук выбирает Gemini; это же
 * заглушка для будущего автоподбора публикаций.
 */
export type ReelReviewMode = 'manual' | 'auto'

type DispatchReelJobInput = {
    adminTelegramId: number
    sourceUpdateId: number
    channelChatId: string
    finalizerUrl: string
    reviewMode?: ReelReviewMode
    session: ReelSessionSnapshot
}

type JobRow = {
    id: string
    status: string
    step: string
    worker_execution_name?: string | null
    lease_expires_at?: string | null
    input_payload?: Record<string, any> | null
    source_update_id?: number | null
    channel_message_id?: number | null
    channel_chat_id?: string | null
    key_trailer?: string | null
}

const requiredEnv = (name: string): string => {
    const value = process.env[name]?.trim()
    if (!value) throw new Error(`[CLOUD RUN CONFIG] ${name} is required`)
    return value
}

export const getSupabase = () => createClient(
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

export const startQueuedJob = async (
    supabase: ReturnType<typeof getSupabase>,
    job: Pick<JobRow, 'id'>
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

// awaiting_review: воркер остановился на проверке администратором (clean или выбор хука).
const ACTIVE_STATUSES = ['queued', 'processing', 'awaiting_review', 'ready', 'publishing']
const TELEGRAM_ONLY_STEP = 'published_telegram_only'
// Шаги, на которых публикация упала уже после начала: финализатор продолжит с них,
// поэтому такую запись удалять нельзя (иначе повторный пост в Instagram).
const FINALIZER_STEPS = [
    'telegram_pending',
    'telegram_published',
    'instagram_container_created',
    'instagram_published'
]

// Задача в работе или публикация, которую можно продолжить: её не удаляем и не заменяем.
const isResumable = (job: JobRow): boolean =>
    ACTIVE_STATUSES.includes(job.status) ||
    (job.status === 'failed' && FINALIZER_STEPS.includes(job.step))

const isLeaseExpired = (job: JobRow): boolean =>
    !job.lease_expires_at || new Date(job.lease_expires_at).getTime() < Date.now()

// Продолжает существующую задачу с того места, где она остановилась. Новая строка
// не создаётся, второй worker не запускается, если первый ещё работает.
const continueJob = async (
    supabase: ReturnType<typeof getSupabase>,
    job: JobRow,
    finalizerUrl: string
): Promise<{jobId: string, status: string, reused: boolean}> => {
    if (
        job.status === 'queued' ||
        // У Cloud Run Job maxRetries=0: после аварии контейнера просроченная
        // processing-задача должна получить новый execution при повторном клике.
        (job.status === 'processing' && isLeaseExpired(job))
    ) {
        // Повторный запуск безопасен: claim_reel_processing_job атомарно
        // разрешает обработку только одному worker. Это также восстанавливает
        // queued-задачи, если Cloud Run принял execution, но его запуск сорвался.
        await startQueuedJob(supabase, job)
    } else if (
        job.status === 'ready' ||
        (job.status === 'publishing' && isLeaseExpired(job))
    ) {
        const token = String(job.input_payload?.finalizerToken ?? '')
        const url = String(job.input_payload?.finalizerUrl ?? finalizerUrl)
        if (token) await callFinalizer(url, job.id, token)
    } else if (job.status === 'awaiting_review') {
        // Повторное «Опубликовать» во время проверки: заново прислать сообщение с кнопками
        // (финализатор видит awaiting_review и вместо публикации шлёт проверку).
        const token = String(job.input_payload?.finalizerToken ?? '')
        const url = String(job.input_payload?.finalizerUrl ?? finalizerUrl)
        if (token) await callFinalizer(url, job.id, token)
    } else if (job.status === 'failed') {
        // Если worker или финализатор завершился с ошибкой, повторяем ту же задачу.
        // Для worker failure финализатор сохранит старое поведение: Telegram-only fallback.
        const token = String(job.input_payload?.finalizerToken ?? '')
        const url = String(job.input_payload?.finalizerUrl ?? finalizerUrl)
        if (!token) throw new Error('[REEL FINALIZER RETRY] Callback token is missing')
        await callFinalizer(url, job.id, token)
        return {jobId: job.id, status: 'finalizing', reused: true}
    }

    return {jobId: job.id, status: job.status, reused: true}
}

// Таблица хранит одну запись на фильм (уникальный ключ media_id + media_type), а не
// историю публикаций. Завершённые записи фильма удаляются: опубликованные и упавшие до
// начала публикации. Статус стоит в условии, чтобы не удалить запись, которую
// параллельное нажатие уже вернуло в работу.
const deleteFinishedJobs = async (
    supabase: ReturnType<typeof getSupabase>,
    ids: string[]
): Promise<number> => {
    if (ids.length === 0) return 0

    const {data, error} = await supabase
        .from('reel_processing_jobs')
        .delete()
        .in('id', ids)
        .in('status', ['published', 'failed'])
        .select('id')

    if (error) {
        throw new Error(`[REEL OLD JOBS CLEANUP ERROR] ${error.message}`)
    }

    return data?.length ?? 0
}

export const dispatchReelJob = async ({
    adminTelegramId,
    sourceUpdateId,
    channelChatId,
    finalizerUrl,
    reviewMode = 'auto',
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
        hook: createInstagramHook(session.mediaType, session.contentType as ContentType, session.media),
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

    // Одна запись на фильм: уникальный ключ (media_id, media_type). Поэтому ищем
    // записи именно по фильму, а не по трейлеру или администратору.
    const {data: mediaRows, error: mediaRowsError} = await supabase
        .from('reel_processing_jobs')
        .select('id,status,step,worker_execution_name,lease_expires_at,input_payload,source_update_id,channel_message_id,channel_chat_id,key_trailer,created_at')
        .eq('media_id', session.mediaId)
        .eq('media_type', session.mediaType)
        .order('created_at', {ascending: false})

    if (mediaRowsError) {
        throw new Error(`[REEL JOB LOOKUP ERROR] ${mediaRowsError.message}`)
    }

    const allRows = (mediaRows ?? []) as JobRow[]
    let rows = allRows

    // Проверка, ждущая администратора, с другим ключом трейлера: администратор сменил
    // трейлер и снова нажал «Опубликовать». Старая проверка больше не нужна (ничего ещё
    // не опубликовано), её запись удаляется, и задача создаётся заново с новым ключом.
    const staleReviews = rows.filter(
        row => row.status === 'awaiting_review' && row.key_trailer !== session.keyTrailer
    )

    if (staleReviews.length > 0) {
        const {error: staleError} = await supabase
            .from('reel_processing_jobs')
            .delete()
            .in('id', staleReviews.map(row => row.id))
            .eq('status', 'awaiting_review')

        if (staleError) {
            throw new Error(`[REEL STALE REVIEW CLEANUP ERROR] ${staleError.message}`)
        }

        console.log('[REEL STALE REVIEW REPLACED]', {
            removed: staleReviews.map(row => row.id),
            keyTrailer: session.keyTrailer
        })

        rows = rows.filter(row => !staleReviews.includes(row))
    }

    // 1. Повторная доставка того же update, нажатие при задаче в работе или при публикации,
    // упавшей на середине: продолжаем существующую запись, ничего не удаляем и не создаём.
    const existingJob =
        rows.find(row => row.source_update_id === sourceUpdateId) ??
        rows.find(isResumable)

    if (existingJob) {
        return continueJob(supabase, existingJob, finalizerUrl)
    }

    // 2. Старые записи фильма завершены (опубликован фильм, Reel не получился, worker упал):
    // они удаляются, создаётся новая запись со своим хуком, описанием и данными нажатия.
    // Ничего из старой записи не переносится, кроме одного: если пост в канал уже опубликован
    // (Reel не получился), новая запись получает его message_id, и финализатор не отправляет
    // карточку в канал второй раз. Clean-видео с тем же ключом трейлера берётся из R2 по его
    // пути (media_id, media_type, key_trailer), с другим ключом трейлер скачивается заново.
    // allRows: удалённая выше устаревшая проверка тоже могла нести пост из прошлой публикации.
    const channelPost = allRows.find(
        row => row.channel_message_id && (
            row.step === TELEGRAM_ONLY_STEP ||
            row.status === 'failed' ||
            row.status === 'awaiting_review'
        )
    )

    // Резюмируемых записей здесь нет (вернулись бы выше), остаются только published и failed.
    const finishedIds = rows
        .filter(row => row.status === 'published' || row.status === 'failed')
        .map(row => row.id)

    const removedJobs = await deleteFinishedJobs(supabase, finishedIds)

    if (removedJobs > 0) {
        console.log('[REEL OLD JOBS REPLACED]', {
            removed: removedJobs,
            keepsChannelPost: Boolean(channelPost),
            sourceUpdateId,
            mediaId: session.mediaId,
            mediaType: session.mediaType
        })
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
            channel_chat_id: channelPost?.channel_chat_id || channelChatId,
            ...(channelPost ? {channel_message_id: channelPost.channel_message_id} : {}),
            status: 'queued',
            step: 'queued',
            review_mode: reviewMode,
            worker_phase: reviewMode === 'manual' ? 'clean' : 'full'
        })
        .select('id,status,step,worker_execution_name')
        .single()

    if (insertError) {
        if (insertError.code === '23505') {
            // Уникальны source_update_id (повторная доставка того же update) и
            // (media_id, media_type) (параллельное нажатие на тот же фильм).
            // В обоих случаях запись уже есть: продолжаем её.
            const {data: sameUpdate, error: sameUpdateError} = await supabase
                .from('reel_processing_jobs')
                .select('id,status,step,worker_execution_name,lease_expires_at,input_payload,source_update_id')
                .eq('source_update_id', sourceUpdateId)
                .maybeSingle()

            if (sameUpdateError) {
                throw new Error(`[REEL JOB DUPLICATE LOOKUP ERROR] ${sameUpdateError.message}`)
            }

            let duplicate = sameUpdate as JobRow | null

            if (!duplicate) {
                const {data: sameMedia, error: sameMediaError} = await supabase
                    .from('reel_processing_jobs')
                    .select('id,status,step,worker_execution_name,lease_expires_at,input_payload,source_update_id')
                    .eq('media_id', session.mediaId)
                    .eq('media_type', session.mediaType)
                    .order('created_at', {ascending: false})
                    .limit(1)
                    .maybeSingle()

                if (sameMediaError) {
                    throw new Error(`[REEL JOB DUPLICATE LOOKUP ERROR] ${sameMediaError.message}`)
                }

                duplicate = sameMedia as JobRow | null
            }

            if (!duplicate) {
                throw new Error('[REEL JOB DUPLICATE LOOKUP ERROR] Existing job not found')
            }

            return continueJob(supabase, duplicate, finalizerUrl)
        }

        throw new Error(`[REEL JOB INSERT ERROR] ${insertError.message}`)
    }

    const job = insertedJob as JobRow
    await startQueuedJob(supabase, job)

    console.log('[REEL JOB DISPATCHED]', {
        jobId: job.id,
        reviewMode,
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
