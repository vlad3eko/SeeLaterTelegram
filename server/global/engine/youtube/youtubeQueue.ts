import {getSupabase, dispatchReelJob} from '#server/global/engine/instagram/reel/jobs/dispatchReelJob'
import {listChannelVideos, type ChannelVideo} from '#server/global/engine/youtube/channelFeed'
import {matchTmdbMedia, parseTrailerTitle} from '#server/global/engine/youtube/matchTmdbMedia'
import {findExcludedTitleReason, findUnsuitableMediaReason, youtubeQueueConfig, type WatchedChannel} from '#server/global/engine/youtube/config'
import {BOT_ADMINS} from '#server/global/oneLinkApp'

/**
 * Автопубликация трейлеров с YouTube через очередь (таблица youtube_publish_queue,
 * database/migrations/youtube_publish_queue.sql).
 *
 * Один «тик» (вызывает таймер: /api/bot/youtubeQueue/tick или dev-плагин):
 *   1. sync    — новые ролики каналов с ключевым словом («дубляж») встают в очередь (queued).
 *      Ролики, чей ключ уже есть в reel_processing_jobs или published_media_messages, не
 *      ставятся: они уже взяты в работу или опубликованы;
 *   2. dispatch — если с прошлой постановки прошёл интервал, самый старый queued: фильм ищется
 *      в TMDB, ставится обычная задача Reel без проверки (как кнопка «Опубликовать» с ключом
 *      из карточки), и строка из очереди удаляется — дальше ролик живёт в reel_processing_jobs.
 *      Воркер Cloud Run и финализатор — без изменений.
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
const syncChannel = async (supabase: Supabase, channel: WatchedChannel, config: ReturnType<typeof youtubeQueueConfig>) => {
    const channelId = channel.id
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
        const title = video.title.toLowerCase()
        if (!channel.keywords.some(keyword => title.includes(keyword))) {
            return {status: 'skipped', reason: `нет «${channel.keywords.join(' / ')}» в названии`}
        }
        const excluded = findExcludedTitleReason(video.title)
        if (excluded) return {status: 'skipped', reason: `не трейлер фильма («${excluded}»)`}
        if (video.publishedAt && now - Date.parse(video.publishedAt) > maxAgeMs) {
            return {status: 'skipped', reason: `старше ${config.maxAgeHours} ч`}
        }
        return {status: 'queued'}
    }

    // Уже взятые в работу или опубликованные ролики (их строки из очереди удалены).
    const videoIds = videos.map(video => video.videoId)
    const [jobs, posts] = await Promise.all([
        supabase.from('reel_processing_jobs').select('key_trailer').in('key_trailer', videoIds),
        supabase.from('published_media_messages').select('key_trailer').in('key_trailer', videoIds)
    ])
    if (jobs.error) throw new Error(`[YOUTUBE QUEUE] ${jobs.error.message}`)
    if (posts.error) throw new Error(`[YOUTUBE QUEUE] ${posts.error.message}`)
    const taken = new Set([...(jobs.data ?? []), ...(posts.data ?? [])].map(row => String(row.key_trailer)))

    // Старые первыми: id в таблице растёт в порядке выхода роликов (у yt-dlp нет даты).
    const rows = [...videos].reverse().filter(video => !taken.has(video.videoId)).map(video => {
        const {status, reason} = classify(video)
        return {
            channel_id: channelId,
            channel_name: channel.name,
            video_id: video.videoId,
            title: video.title,
            video_published_at: video.publishedAt ?? null,
            status,
            last_error: reason ?? null
        }
    })

    const {data: inserted, error} = rows.length
        ? await supabase
            .from('youtube_publish_queue')
            .upsert(rows, {onConflict: 'video_id', ignoreDuplicates: true})
            .select('id,video_id,title,status')
        : {data: [], error: null}
    if (error) throw new Error(`[YOUTUBE QUEUE] ${error.message}`)

    const queued = (inserted ?? []).filter(row => row.status === 'queued')
    // Без сообщения на каждый ролик: у студий их несколько в день. Сообщение приходит при сборке Reel.
    console.log('[YOUTUBE QUEUE SYNC]', {channel: channel.name, source, seen: videos.length, inserted: inserted?.length ?? 0, queued: queued.length, baseline})
}

/** Строки первой версии (dispatched/published): ролик уже в reel_processing_jobs, из очереди убрать. */
const removeLegacyRows = async (supabase: Supabase) => {
    const {error} = await supabase
        .from('youtube_publish_queue')
        .delete()
        .in('status', ['dispatched', 'published'])
    if (error) throw new Error(`[YOUTUBE QUEUE] ${error.message}`)
}

const updateRow = async (supabase: Supabase, id: number, patch: Record<string, unknown>) => {
    const {error} = await supabase
        .from('youtube_publish_queue')
        .update({...patch, updated_at: new Date().toISOString()})
        .eq('id', id)
    if (error) console.error('[YOUTUBE QUEUE UPDATE ERROR]', {id, message: error.message})
}

/** 2. Следующий ролик очереди → задача Reel (если подошёл интервал), строка удаляется. */
const dispatchNext = async (supabase: Supabase, config: ReturnType<typeof youtubeQueueConfig>) => {
    // Интервал от последней задачи Reel из очереди (то же условие есть в claim_youtube_queue_item;
    // здесь — на случай старой версии функции в базе).
    const {data: lastJob, error: lastError} = await supabase
        .from('reel_processing_jobs')
        .select('created_at')
        .gte('source_update_id', QUEUE_SOURCE_UPDATE_OFFSET)
        // Только задачи, для которых Cloud Run действительно запущен: неудачный запуск не тратит интервал.
        .not('worker_execution_name', 'is', null)
        .order('created_at', {ascending: false})
        .limit(1)
        .maybeSingle()
    if (lastError) throw new Error(`[YOUTUBE QUEUE] ${lastError.message}`)
    if (lastJob && Date.now() - Date.parse(lastJob.created_at) < config.intervalMinutes * 60_000) return null

    const {data, error} = await supabase.rpc('claim_youtube_queue_item', {
        p_interval_minutes: config.intervalMinutes,
        // Ролики этих каналов (русские трейлеры) выдаются первыми.
        p_priority_channels: config.channels.filter(channel => channel.priority).map(channel => channel.id)
    })
    if (error) throw new Error(`[YOUTUBE QUEUE CLAIM] ${error.message}`)

    const row = (Array.isArray(data) ? data[0] : data) as QueueRow | undefined
    if (!row) return null

    // notify: false — ожидаемые пропуски (трейлер игры или подкаста, фильм недавно публиковался):
    // только запись в таблице, без сообщения.
    const fail = async (message: string, {notify = true}: {notify?: boolean} = {}) => {
        await updateRow(supabase, row.id, {status: 'failed', last_error: message, finished_at: new Date().toISOString()})
        if (notify) await notifyAdmin(`⚠️ Автопубликация пропущена: ${row.title}\nПричина: ${message}\n${videoUrl(row.video_id)}`)
        return {videoId: row.video_id, result: 'failed', message}
    }

    const parsed = parseTrailerTitle(row.title)
    if (!parsed) return fail('не удалось выделить название фильма', {notify: false})

    let matched
    try {
        matched = await matchTmdbMedia(parsed)
    } catch (matchError) {
        // Сбой TMDB временный: вернуть в очередь.
        await updateRow(supabase, row.id, {status: 'queued', last_error: errorText(matchError)})
        return {videoId: row.video_id, result: 'retry', message: errorText(matchError)}
    }
    if (!matched) return fail(`в TMDB нет точного совпадения для «${parsed.name}»${parsed.year ? ` (${parsed.year})` : ''}`, {notify: false})

    // Ток-шоу и реалити, тайтлы без сюжета или постера не публикуются.
    const unsuitable = findUnsuitableMediaReason(matched.media)
    if (unsuitable) return fail(`«${matched.tmdbTitle}»: ${unsuitable}`, {notify: false})

    // Один фильм часто выходит на нескольких каналах (студия, Disney+, потом дубляж): не чаще
    // раза в YOUTUBE_QUEUE_FILM_COOLDOWN_DAYS.
    if (config.filmCooldownDays > 0) {
        const since = new Date(Date.now() - config.filmCooldownDays * 24 * 60 * 60_000).toISOString()
        const {data: recent, error: recentError} = await supabase
            .from('reel_processing_jobs')
            .select('published_at')
            .eq('media_id', matched.mediaId)
            .eq('media_type', matched.mediaType)
            .eq('status', 'published')
            .gte('published_at', since)
            .limit(1)
        if (recentError) throw new Error(`[YOUTUBE QUEUE] ${recentError.message}`)
        if (recent?.length) {
            return fail(`«${matched.tmdbTitle}» уже публиковался за последние ${config.filmCooldownDays} дн.`, {notify: false})
        }
    }

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

        // Задача Reel поставлена: дальше ролик живёт в reel_processing_jobs, из очереди он удаляется.
        // Если удаление не прошло, строка останется dispatching и через 15 минут будет взята снова:
        // dispatchReelJob с тем же source_update_id вернёт ту же задачу, второй не будет.
        const {error: deleteError} = await supabase
            .from('youtube_publish_queue')
            .delete()
            .eq('id', row.id)
        if (deleteError) console.error('[YOUTUBE QUEUE DELETE ERROR]', {id: row.id, message: deleteError.message})

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

    try {
        await removeLegacyRows(supabase)
    } catch (error) {
        errors.push(errorText(error))
        console.error('[YOUTUBE QUEUE CLEANUP ERROR]', errorText(error))
    }

    // Каналы по четыре одновременно: с yt-dlp каждый занимает несколько секунд.
    const pending = [...config.channels]
    const syncWorker = async () => {
        for (let channel = pending.shift(); channel; channel = pending.shift()) {
            try {
                await syncChannel(supabase, channel, config)
            } catch (error) {
                errors.push(`${channel.name}: ${errorText(error)}`)
                console.error('[YOUTUBE QUEUE SYNC ERROR]', {channel: channel.name, message: errorText(error)})
            }
        }
    }
    await Promise.all([syncWorker(), syncWorker(), syncWorker(), syncWorker()])

    // Воркер Cloud Run сообщает о готовом Reel по https (dispatchReelJob требует https). В npm run dev
    // без туннеля адреса нет: ролики спокойно ждут в очереди, попытки не тратятся.
    const {URL_ACTIVE} = await import('#server/bot/bot')
    const finalizerBase = process.env.REEL_FINALIZER_BASE_URL?.trim() || URL_ACTIVE
    if (!/^https:\/\//i.test(finalizerBase)) {
        console.log('[YOUTUBE QUEUE] No https finalizer URL (run npm run dev:tunnel); dispatch skipped')
        return {dispatched: null, errors, waiting: 'no https finalizer URL'}
    }

    // Пропуск (фильм не найден, недавно публиковался) задачу не ставит и интервал не тратит:
    // сразу пробуем следующий ролик, но не больше 10 за тик.
    const results: unknown[] = []
    try {
        for (let attempt = 0; attempt < 10; attempt++) {
            const result = await dispatchNext(supabase, config)
            if (!result) break
            results.push(result)
            if (result.result !== 'failed') break
        }
    } catch (error) {
        errors.push(errorText(error))
        console.error('[YOUTUBE QUEUE DISPATCH ERROR]', errorText(error))
    }

    return {dispatched: results, errors}
}
