import {getSupabase, dispatchReelJob} from '#server/global/engine/instagram/reel/jobs/dispatchReelJob'
import {listChannelVideos, type ChannelVideo} from '#server/global/engine/youtube/channelFeed'
import {matchTmdbMedia, parseTrailerTitle} from '#server/global/engine/youtube/matchTmdbMedia'
import {youtubeQueueConfig} from '#server/global/engine/youtube/config'
import {BOT_ADMINS} from '#server/global/oneLinkApp'

/**
 * Автопубликация трейлеров с YouTube через очередь (таблица youtube_publish_queue,
 * database/migrations/youtube_publish_queue.sql).
 *
 * Один «тик» (вызывает таймер: /api/bot/youtubeQueue/tick или dev-плагин):
 *   1. sync    — новые ролики каналов с ключевым словом («дубляж») встают в очередь (queued);
 *   2. refresh — поставленные задачи Reel, которые опубликовались или упали, закрываются;
 *   3. dispatch — если с прошлой постановки прошёл интервал, самый старый queued: фильм ищется
 *      в TMDB, ставится обычная задача Reel без проверки (как кнопка «Опубликовать» с ключом
 *      из карточки). Дальше воркер Cloud Run и финализатор — без изменений.
 */

type QueueRow = {
    id: number
    channel_id: string
    video_id: string
    title: string
    video_published_at: string | null
    status: string
    attempts: number
    reel_job_id: string | null
    media_id: number | null
    media_type: string | null
}

type Supabase = ReturnType<typeof getSupabase>

/** source_update_id задач из очереди: вне диапазона update_id Telegram, стабилен при повторе. */
const QUEUE_SOURCE_UPDATE_OFFSET = 1_000_000_000_000

const ACTIVE_REEL_STATUSES = ['queued', 'processing', 'awaiting_review', 'ready', 'publishing']
const RESUMABLE_FAILED_STEPS = ['telegram_pending', 'telegram_published', 'instagram_container_created', 'instagram_published']
const MAX_DISPATCH_ATTEMPTS = 3
const BUSY_POSTPONE_MINUTES = 30

const errorText = (error: unknown) =>
    (error instanceof Error ? error.message : String(error)).split('\n')[0]!.slice(0, 500)

const notifyAdmin = async (text: string) => {
    try {
        const {bot} = await import('#server/bot/bot')
        for (const adminId of BOT_ADMINS) {
            await bot.telegram.sendMessage(adminId, text, {link_preview_options: {is_disabled: true}})
        }
    } catch (error) {
        console.error('[YOUTUBE QUEUE NOTIFY ERROR]', errorText(error))
    }
}

const videoUrl = (videoId: string) => `https://www.youtube.com/watch?v=${videoId}`

/** 1. Новые ролики каналов → очередь. Первая встреча с каналом: всё, что уже есть, — skipped. */
const syncChannel = async (supabase: Supabase, channelId: string, config: ReturnType<typeof youtubeQueueConfig>) => {
    const {videos, source} = await listChannelVideos(channelId, {apiKey: config.apiKey})

    const {count, error: countError} = await supabase
        .from('youtube_publish_queue')
        .select('id', {count: 'exact', head: true})
        .eq('channel_id', channelId)
    if (countError) throw new Error(`[YOUTUBE QUEUE] ${countError.message}`)

    const baseline = (count ?? 0) === 0
    const maxAgeMs = config.maxAgeHours * 60 * 60 * 1000
    const now = Date.now()

    const classify = (video: ChannelVideo): {status: 'queued' | 'skipped', reason?: string} => {
        if (baseline) return {status: 'skipped', reason: 'было на канале до начала слежения'}
        if (!video.title.toLowerCase().includes(config.keyword)) return {status: 'skipped', reason: `нет «${config.keyword}» в названии`}
        if (video.publishedAt && now - Date.parse(video.publishedAt) > maxAgeMs) {
            return {status: 'skipped', reason: `старше ${config.maxAgeHours} ч`}
        }
        return {status: 'queued'}
    }

    // Старые первыми: id в таблице растёт в порядке выхода роликов (у yt-dlp нет даты).
    const rows = [...videos].reverse().map(video => {
        const {status, reason} = classify(video)
        return {
            channel_id: channelId,
            video_id: video.videoId,
            title: video.title,
            video_published_at: video.publishedAt ?? null,
            status,
            last_error: reason ?? null
        }
    })

    const {data: inserted, error} = await supabase
        .from('youtube_publish_queue')
        .upsert(rows, {onConflict: 'video_id', ignoreDuplicates: true})
        .select('id,video_id,title,status')
    if (error) throw new Error(`[YOUTUBE QUEUE] ${error.message}`)

    const queued = (inserted ?? []).filter(row => row.status === 'queued')
    console.log('[YOUTUBE QUEUE SYNC]', {channelId, source, seen: videos.length, inserted: inserted?.length ?? 0, queued: queued.length, baseline})

    for (const row of queued) {
        await notifyAdmin(`🆕 В очередь автопубликации: ${row.title}\n${videoUrl(row.video_id)}`)
    }
}

/** 2. Закрыть строки, чья задача Reel завершилась. */
const refreshDispatched = async (supabase: Supabase) => {
    const {data: rows, error} = await supabase
        .from('youtube_publish_queue')
        .select('id,title,video_id,reel_job_id')
        .eq('status', 'dispatched')
    if (error) throw new Error(`[YOUTUBE QUEUE] ${error.message}`)
    if (!rows?.length) return

    const jobIds = rows.map(row => row.reel_job_id).filter(Boolean) as string[]
    const {data: jobs, error: jobsError} = await supabase
        .from('reel_processing_jobs')
        .select('id,status,step,last_error')
        .in('id', jobIds)
    if (jobsError) throw new Error(`[YOUTUBE QUEUE] ${jobsError.message}`)

    const byId = new Map((jobs ?? []).map(job => [job.id, job]))

    for (const row of rows) {
        const job = row.reel_job_id ? byId.get(row.reel_job_id) : undefined
        let patch: Record<string, unknown> | null = null

        if (!job) {
            // Запись задачи заменила новая публикация того же фильма (одна запись на фильм).
            patch = {status: 'failed', last_error: 'задача Reel удалена или заменена'}
        } else if (job.status === 'published') {
            patch = job.step === 'published_telegram_only'
                ? {status: 'failed', last_error: 'опубликовано только в Telegram: Reel для Instagram не получился'}
                : {status: 'published', last_error: null}
        } else if (job.status === 'failed' && !RESUMABLE_FAILED_STEPS.includes(job.step)) {
            patch = {status: 'failed', last_error: String(job.last_error ?? job.step ?? 'задача Reel упала').slice(0, 500)}
        }

        if (patch) {
            await supabase
                .from('youtube_publish_queue')
                .update({...patch, finished_at: new Date().toISOString(), updated_at: new Date().toISOString()})
                .eq('id', row.id)
                .eq('status', 'dispatched')
        }
    }
}

const updateRow = async (supabase: Supabase, id: number, patch: Record<string, unknown>) => {
    const {error} = await supabase
        .from('youtube_publish_queue')
        .update({...patch, updated_at: new Date().toISOString()})
        .eq('id', id)
    if (error) console.error('[YOUTUBE QUEUE UPDATE ERROR]', {id, message: error.message})
}

/** 3. Следующий ролик очереди → задача Reel (если подошёл интервал). */
const dispatchNext = async (supabase: Supabase, config: ReturnType<typeof youtubeQueueConfig>) => {
    const {data, error} = await supabase.rpc('claim_youtube_queue_item', {p_interval_minutes: config.intervalMinutes})
    if (error) throw new Error(`[YOUTUBE QUEUE CLAIM] ${error.message}`)

    const row = (Array.isArray(data) ? data[0] : data) as QueueRow | undefined
    if (!row) return null

    const fail = async (message: string) => {
        await updateRow(supabase, row.id, {status: 'failed', last_error: message, finished_at: new Date().toISOString()})
        await notifyAdmin(`⚠️ Автопубликация пропущена: ${row.title}\nПричина: ${message}\n${videoUrl(row.video_id)}`)
        return {videoId: row.video_id, result: 'failed', message}
    }

    const parsed = parseTrailerTitle(row.title)
    if (!parsed) return fail('не удалось выделить название фильма')

    let matched
    try {
        matched = await matchTmdbMedia(parsed)
    } catch (matchError) {
        // Сбой TMDB временный: вернуть в очередь.
        await updateRow(supabase, row.id, {status: 'queued', last_error: errorText(matchError)})
        return {videoId: row.video_id, result: 'retry', message: errorText(matchError)}
    }
    if (!matched) return fail(`в TMDB нет точного совпадения для «${parsed.name}»${parsed.year ? ` (${parsed.year})` : ''}`)

    const mediaPatch = {
        media_id: matched.mediaId,
        media_type: matched.mediaType,
        content_type: matched.contentType,
        tmdb_title: matched.tmdbTitle
    }

    // Фильм сейчас в работе (вручную или прошлой задачей): не перехватывать, попробовать позже.
    const {data: activeJobs, error: activeError} = await supabase
        .from('reel_processing_jobs')
        .select('id')
        .eq('media_id', matched.mediaId)
        .eq('media_type', matched.mediaType)
        // В работе, или публикация упала на середине (dispatchReelJob продолжил бы её, а не новую).
        .or(`status.in.(${ACTIVE_REEL_STATUSES.join(',')}),and(status.eq.failed,step.in.(${RESUMABLE_FAILED_STEPS.join(',')}))`)
        .limit(1)
    if (activeError) throw new Error(`[YOUTUBE QUEUE] ${activeError.message}`)
    if (activeJobs?.length) {
        await updateRow(supabase, row.id, {
            ...mediaPatch,
            status: 'queued',
            not_before: new Date(Date.now() + BUSY_POSTPONE_MINUTES * 60_000).toISOString(),
            last_error: 'по фильму уже идёт задача Reel; повтор позже'
        })
        return {videoId: row.video_id, result: 'postponed'}
    }

    try {
        // Те же значения, что у кнопки «Опубликовать» (publishAdminInlineMedia.ts).
        const {CHANEL_LINK, URL_ACTIVE} = await import('#server/bot/bot')
        const media = matched.media
        const poster = media.poster_path || media.backdrop_path

        const result = await dispatchReelJob({
            adminTelegramId: Number(BOT_ADMINS[0]),
            sourceUpdateId: QUEUE_SOURCE_UPDATE_OFFSET + Number(row.id),
            channelChatId: String(CHANEL_LINK),
            finalizerUrl: `${(process.env.REEL_FINALIZER_BASE_URL?.trim() || URL_ACTIVE).replace(/\/$/, '')}/api/bot/reelJobs/finalize`,
            reviewMode: 'auto',
            session: {
                media,
                mediaId: matched.mediaId,
                mediaType: matched.mediaType,
                contentType: matched.contentType,
                keyTrailer: row.video_id,
                currentMedia: {
                    type: 'photo',
                    fileId: `https://image.tmdb.org/t/p/original${poster}`
                },
                isRichTypeCard: false,
                videoType: 'trailer'
            }
        })

        await updateRow(supabase, row.id, {
            ...mediaPatch,
            status: 'dispatched',
            reel_job_id: result.jobId,
            dispatched_at: new Date().toISOString(),
            not_before: null,
            last_error: null
        })
        await notifyAdmin(`▶️ Автопубликация: собираю Reel «${matched.tmdbTitle}» из ${row.title}\n${videoUrl(row.video_id)}`)
        console.log('[YOUTUBE QUEUE DISPATCHED]', {videoId: row.video_id, jobId: result.jobId, mediaId: matched.mediaId})
        return {videoId: row.video_id, result: 'dispatched', jobId: result.jobId}

    } catch (dispatchError) {
        const message = errorText(dispatchError)
        if (row.attempts >= MAX_DISPATCH_ATTEMPTS) return fail(`не удалось поставить задачу Reel: ${message}`)

        await updateRow(supabase, row.id, {
            ...mediaPatch,
            status: 'queued',
            not_before: new Date(Date.now() + 10 * 60_000).toISOString(),
            last_error: message
        })
        return {videoId: row.video_id, result: 'retry', message}
    }
}

/** Один тик таймера. Ошибка одного канала не мешает остальным шагам. */
export const processYoutubeQueue = async () => {
    const config = youtubeQueueConfig()
    if (!config.enabled) return {skipped: 'YOUTUBE_QUEUE_ENABLED=off'}

    const supabase = getSupabase()
    const errors: string[] = []

    for (const channelId of config.channels) {
        try {
            await syncChannel(supabase, channelId, config)
        } catch (error) {
            errors.push(errorText(error))
            console.error('[YOUTUBE QUEUE SYNC ERROR]', {channelId, message: errorText(error)})
        }
    }

    try {
        await refreshDispatched(supabase)
    } catch (error) {
        errors.push(errorText(error))
        console.error('[YOUTUBE QUEUE REFRESH ERROR]', errorText(error))
    }

    // Воркер Cloud Run сообщает о готовом Reel по https (dispatchReelJob требует https). В npm run dev
    // без туннеля адреса нет: ролики спокойно ждут в очереди, попытки не тратятся.
    const {URL_ACTIVE} = await import('#server/bot/bot')
    const finalizerBase = process.env.REEL_FINALIZER_BASE_URL?.trim() || URL_ACTIVE
    if (!/^https:\/\//i.test(finalizerBase)) {
        console.log('[YOUTUBE QUEUE] No https finalizer URL (run npm run dev:tunnel); dispatch skipped')
        return {dispatched: null, errors, waiting: 'no https finalizer URL'}
    }

    let dispatched = null
    try {
        dispatched = await dispatchNext(supabase, config)
    } catch (error) {
        errors.push(errorText(error))
        console.error('[YOUTUBE QUEUE DISPATCH ERROR]', errorText(error))
    }

    return {dispatched, errors}
}
