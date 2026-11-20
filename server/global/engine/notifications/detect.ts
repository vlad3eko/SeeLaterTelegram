import type {SupabaseClient} from '@supabase/supabase-js'
import {mapLimit, tmdbFetch} from '#server/global/engine/collections/tmdb'
import {youtubeQueueConfig} from '#server/global/engine/youtube/config'
import {
    compareSnapshot,
    imagesDue,
    moscowDate,
    premiereEvent,
    type Episode,
    type MediaType,
    type NewEvent,
    type Snapshot,
    type WatchColumns
} from '#server/global/engine/notifications/snapshot'

/**
 * Сбор событий по сохранённым (этап detect). Тайтл проверяется ОДИН раз на всех, кто его сохранил:
 * media_watch — одна строка на тайтл. Здесь нет пользователей вообще — только тайтлы и события.
 *
 * 1. Новые тайтлы из favorites → media_watch (первая проверка запишет снимок без событий).
 * 2. Тайтлы, которым пора (next_check_at), — запрос в TMDB, сравнение со снимком, события.
 * 3. Трейлеры из нашей YouTube-очереди и опубликованных роликов — тем же ключом, что из TMDB.
 * 4. Премьеры сегодня — из известной даты, без TMDB.
 */

type Supabase = SupabaseClient<any, any, any>

type WatchRow = WatchColumns & {
    media_type: MediaType
    tmdb_id: number
    snapshot: Snapshot | null
    checked_at: string | null
}

const BATCH = 50
const PARALLEL = 4
const TIME_BUDGET_MS = 120_000
const PAGE = 1000
const TRAILER_LOOKBACK_MS = 3 * 24 * 60 * 60_000

const isMissingTable = (error: any) => error?.code === '42P01' || /does not exist|schema cache/i.test(String(error?.message))

/** Все строки выборки страницами по 1000 (лимит Supabase). */
const selectAll = async <T>(build: (from: number, to: number) => PromiseLike<{data: T[] | null, error: any}>): Promise<T[]> => {
    const rows: T[] = []
    for (let from = 0; ; from += PAGE) {
        const {data, error} = await build(from, from + PAGE - 1)
        if (error) throw error
        rows.push(...(data ?? []))
        if (!data || data.length < PAGE) return rows
    }
}

/** Записать события; повтор того же event_key молча пропускается. */
export const saveEvents = async (supabase: Supabase, mediaType: MediaType, tmdbId: number, events: NewEvent[]): Promise<number> => {
    if (!events.length) return 0
    const {data, error} = await supabase
        .from('media_events')
        .upsert(events.map(event => ({
            media_type: mediaType,
            tmdb_id: tmdbId,
            event_type: event.eventType,
            event_key: event.eventKey,
            event_date: event.eventDate,
            payload: event.payload,
            source: event.source
        })), {onConflict: 'event_key', ignoreDuplicates: true})
        .select('id')
    if (error) throw error
    return data?.length ?? 0
}

/**
 * Список слежки = сохранённые: новые тайтлы из favorites заносим, а тайтлы, которые больше никто
 * не хранит, убираем — их незачем проверять в TMDB. Сохранят снова — первая проверка будет без событий.
 */
const syncWatchList = async (supabase: Supabase): Promise<number> => {
    const [favorites, watched] = await Promise.all([
        selectAll<{media_type: string, tmdb_id: number, title: string | null, poster_path: string | null}>((from, to) =>
            supabase.from('favorites').select('media_type,tmdb_id,title,poster_path').order('id').range(from, to)),
        selectAll<{media_type: string, tmdb_id: number}>((from, to) =>
            supabase.from('media_watch').select('media_type,tmdb_id').order('tmdb_id').range(from, to))
    ])
    const known = new Set(watched.map(row => `${row.media_type}:${row.tmdb_id}`))
    const saved = new Set(favorites.map(row => `${row.media_type}:${row.tmdb_id}`))
    for (const row of watched.filter(item => !saved.has(`${item.media_type}:${item.tmdb_id}`))) {
        const {error} = await supabase.from('media_watch').delete().eq('media_type', row.media_type).eq('tmdb_id', row.tmdb_id)
        if (error) throw error
    }
    const missing = new Map<string, {media_type: string, tmdb_id: number, title: string | null, poster_path: string | null}>()
    for (const row of favorites) {
        const key = `${row.media_type}:${row.tmdb_id}`
        if ((row.media_type === 'movie' || row.media_type === 'tv') && Number(row.tmdb_id) && !known.has(key)) missing.set(key, row)
    }
    if (!missing.size) return 0
    const {error} = await supabase.from('media_watch').upsert([...missing.values()], {onConflict: 'media_type,tmdb_id', ignoreDuplicates: true})
    if (error) throw error
    return missing.size
}

const toEpisodes = (season: any): Episode[] =>
    (season?.episodes ?? []).map((item: any) => ({
        id: Number(item.id),
        season: Number(item.season_number) || 0,
        episode: Number(item.episode_number) || 0,
        airDate: typeof item.air_date === 'string' ? item.air_date.slice(0, 10) : null
    }))

/** Проверить один тайтл: TMDB → сравнение → события → новый снимок. */
const checkTitle = async (supabase: Supabase, row: WatchRow, now: Date) => {
    const {media_type: mediaType, tmdb_id: tmdbId} = row
    const append = mediaType === 'movie' ? 'release_dates,videos' : 'videos'
    const details = await tmdbFetch(`${mediaType}/${tmdbId}?language=ru-RU&append_to_response=${append}&include_video_language=ru,en,null`)

    // Постеры любого языка (решение владельца 21.11): с language=ru-RU TMDB отдаёт только русские,
    // поэтому отдельный запрос без языка — по своему расписанию.
    const images = imagesDue({mediaType, columns: row.checked_at ? row : null, snapshot: row.snapshot, now})
        ? await tmdbFetch(`${mediaType}/${tmdbId}/images`)
        : undefined

    // Сменилась последняя вышедшая серия — серии её сезона: вдруг вышло несколько сразу.
    let seasonEpisodes: Episode[] | undefined
    const previousEpisode = row.snapshot?.lastEpisode
    const last = (details as any)?.last_episode_to_air
    if (mediaType === 'tv' && row.snapshot && previousEpisode && last?.id && Number(last.id) !== previousEpisode.id) {
        seasonEpisodes = toEpisodes(await tmdbFetch(`tv/${tmdbId}/season/${Number(last.season_number)}?language=ru-RU`).catch(() => undefined))
    }

    const result = compareSnapshot({
        mediaType,
        tmdbId,
        details,
        images,
        seasonEpisodes,
        previous: row.checked_at ? row.snapshot ?? {} : null,
        previousCheckedAt: row.checked_at,
        now
    })

    // Сначала события, потом снимок: упадёт запись событий — снимок старый, следующая проверка
    // найдёт то же самое (ключи не дадут дублей).
    const created = await saveEvents(supabase, mediaType, tmdbId, result.events)
    const {error} = await supabase.from('media_watch').update({
        ...result.columns,
        snapshot: result.snapshot,
        checked_at: now.toISOString(),
        next_check_at: result.nextCheckAt,
        last_error: null
    }).eq('media_type', mediaType).eq('tmdb_id', tmdbId)
    if (error) throw error
    return {created, baseline: result.baseline}
}

/** Трейлеры из YouTube-очереди и опубликованных роликов по тайтлам, за которыми следим. */
const collectQueueTrailers = async (supabase: Supabase, now: Date): Promise<number> => {
    const since = new Date(now.getTime() - TRAILER_LOOKBACK_MS).toISOString()
    const priority = new Set(youtubeQueueConfig().channels.filter(channel => channel.priority).map(channel => channel.id))

    const [queue, jobs] = await Promise.all([
        supabase.from('youtube_publish_queue')
            .select('video_id,channel_id,title,media_id,media_type,video_published_at')
            .not('media_id', 'is', null).gte('created_at', since).limit(500),
        supabase.from('reel_processing_jobs')
            .select('key_trailer,media_id,media_type,created_at')
            .not('key_trailer', 'is', null).gte('created_at', since).limit(500)
    ])
    if (queue.error) console.warn('[NOTIFY] queue trailers skipped', queue.error.message)
    if (jobs.error) console.warn('[NOTIFY] reel trailers skipped', jobs.error.message)

    type Found = {mediaType: MediaType, tmdbId: number, key: string, russian: boolean, name: string, publishedAt: string | null, source: 'youtube_queue' | 'reel_job'}
    const found: Found[] = [
        ...(queue.data ?? []).map((row: any) => ({
            mediaType: row.media_type, tmdbId: Number(row.media_id), key: String(row.video_id),
            russian: priority.has(row.channel_id) || /дубляж|русск/i.test(String(row.title)),
            name: String(row.title ?? ''), publishedAt: row.video_published_at ?? null, source: 'youtube_queue' as const
        })),
        ...(jobs.data ?? []).map((row: any) => ({
            mediaType: row.media_type, tmdbId: Number(row.media_id), key: String(row.key_trailer),
            russian: true, name: '', publishedAt: row.created_at ?? null, source: 'reel_job' as const
        }))
    ].filter(item => (item.mediaType === 'movie' || item.mediaType === 'tv') && item.tmdbId && /^[0-9A-Za-z_-]{11}$/.test(item.key))
    if (!found.length) return 0

    // Только тайтлы, за которыми следим и у которых уже есть снимок (иначе трейлер — старая новость).
    const ids = [...new Set(found.map(item => item.tmdbId))]
    const {data: watched, error} = await supabase.from('media_watch')
        .select('media_type,tmdb_id,checked_at,created_at').in('tmdb_id', ids).not('checked_at', 'is', null)
    if (error) throw error
    const watchedSince = new Map((watched ?? []).map((row: any) => [`${row.media_type}:${row.tmdb_id}`, row.created_at as string]))

    let created = 0
    for (const item of found) {
        const startedAt = watchedSince.get(`${item.mediaType}:${item.tmdbId}`)
        if (!startedAt || (item.publishedAt && Date.parse(item.publishedAt) < Date.parse(startedAt))) continue
        created += await saveEvents(supabase, item.mediaType, item.tmdbId, [{
            eventType: 'trailer_added',
            eventKey: `${item.mediaType}:${item.tmdbId}:trailer:${item.key}`,
            eventDate: item.publishedAt?.slice(0, 10) ?? moscowDate(now),
            payload: {key: item.key, russian: item.russian, teaser: /тизер|teaser/i.test(item.name), name: item.name},
            source: item.source
        }])
    }
    return created
}

/** Премьеры сегодня по известной (подтверждённой) дате. */
const collectPremieres = async (supabase: Supabase, now: Date): Promise<number> => {
    const today = moscowDate(now)
    const {data, error} = await supabase.from('media_watch')
        .select('tmdb_id').eq('media_type', 'movie').eq('release_date', today).not('checked_at', 'is', null)
    if (error) throw error
    let created = 0
    for (const row of data ?? []) created += await saveEvents(supabase, 'movie', Number(row.tmdb_id), [premiereEvent(Number(row.tmdb_id), today)])
    return created
}

export type DetectReport = {
    added: number
    checked: number
    baselines: number
    events: number
    errors: number
    skipped?: string
}

export const detectUpdates = async (supabase: Supabase, now = new Date()): Promise<DetectReport> => {
    const started = Date.now()
    const report: DetectReport = {added: 0, checked: 0, baselines: 0, events: 0, errors: 0}

    try {
        report.added = await syncWatchList(supabase)
    } catch (error: any) {
        if (isMissingTable(error)) return {...report, skipped: 'нет таблиц: выполните database/migrations/notifications.sql'}
        throw error
    }

    const {data: due, error} = await supabase.from('media_watch')
        .select('media_type,tmdb_id,title,poster_path,status,release_date,digital_date,next_episode_air_date,next_episode,last_episode_id,snapshot,checked_at')
        // Текущее время, а не начало прогона: только что занесённые тайтлы (next_check_at = now() базы)
        // попадают в эту же проверку, а не ждут следующего таймера.
        .lte('next_check_at', new Date().toISOString())
        .order('next_check_at')
        .limit(BATCH)
    if (error) throw error

    await mapLimit((due ?? []) as WatchRow[], PARALLEL, async row => {
        if (Date.now() - started > TIME_BUDGET_MS) return
        try {
            const {created, baseline} = await checkTitle(supabase, row, now)
            report.checked++
            report.events += created
            if (baseline) report.baselines++
        } catch (checkError: any) {
            report.errors++
            const message = String(checkError?.message ?? checkError).slice(0, 500)
            console.warn('[NOTIFY] check failed', row.media_type, row.tmdb_id, message)
            // Снимок не трогаем; повтор через 6 часов.
            await supabase.from('media_watch').update({
                last_error: message,
                next_check_at: new Date(now.getTime() + 6 * 60 * 60_000).toISOString()
            }).eq('media_type', row.media_type).eq('tmdb_id', row.tmdb_id)
        }
    })

    report.events += await collectQueueTrailers(supabase, now)
    report.events += await collectPremieres(supabase, now)
    return report
}
