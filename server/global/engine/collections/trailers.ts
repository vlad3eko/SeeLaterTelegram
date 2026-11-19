import {getSupabase} from '#server/global/engine/instagram/reel/jobs/dispatchReelJob'
import {mapLimit, tmdbGet} from '#server/global/engine/collections/tmdb'
import type {MediaType} from '#server/global/engine/collections/catalog'

export type Trailer = {
    key: string
    language: 'ru' | 'en'
    type: 'Trailer' | 'Teaser'
    name: string
}

/** Найденный трейлер в кэше живёт 30 дней, «трейлера нет» — сутки (у новинок он появляется позже). */
const FOUND_TTL_MS = 30 * 24 * 60 * 60_000
const MISSING_TTL_MS = 24 * 60 * 60_000

type Video = {key: string, site: string, type: string, iso_639_1: string, official: boolean, name: string, published_at: string}

/**
 * Лучший трейлер YouTube: сначала русский, потом английский; тип Trailer, затем Teaser;
 * официальный в приоритете; среди равных — самый новый.
 */
export const pickTrailer = (videos: Video[]): Trailer | null => {
    const candidates = videos.filter(video =>
        video.site === 'YouTube' &&
        /^[0-9A-Za-z_-]{11}$/.test(video.key) &&
        (video.type === 'Trailer' || video.type === 'Teaser') &&
        (video.iso_639_1 === 'ru' || video.iso_639_1 === 'en'))

    const rank = (video: Video) =>
        (video.iso_639_1 === 'ru' ? 0 : 4) + (video.type === 'Trailer' ? 0 : 2) + (video.official ? 0 : 1)

    const best = candidates.sort((a, b) =>
        rank(a) - rank(b) || Date.parse(b.published_at) - Date.parse(a.published_at))[0]

    return best
        ? {key: best.key, language: best.iso_639_1 as 'ru' | 'en', type: best.type as 'Trailer' | 'Teaser', name: best.name}
        : null
}

let cacheBroken = false

/**
 * Таблицы media_trailers нет (до миграции collections.sql) — кэш выключается до перезапуска.
 * Разовый сбой сети или базы его не выключает: иначе до перезапуска все трейлеры шли бы в TMDB.
 */
export const isMissingTable = (error: unknown) => {
    const code = String((error as any)?.code ?? '')
    const message = String((error as any)?.message ?? error ?? '')
    return code === '42P01' || code === 'PGRST205' || /does not exist|could not find the table/i.test(message)
}

const readCache = async (mediaType: MediaType, ids: number[]) => {
    if (cacheBroken || !ids.length) return new Map<number, Trailer | null>()
    try {
        const {data, error} = await getSupabase()
            .from('media_trailers')
            .select('media_id,video_key,language,video_type,name,checked_at')
            .eq('media_type', mediaType)
            .in('media_id', ids)
        if (error) throw error

        const now = Date.now()
        const cache = new Map<number, Trailer | null>()
        for (const row of data ?? []) {
            const age = now - Date.parse(row.checked_at)
            if (row.video_key && age < FOUND_TTL_MS) {
                cache.set(Number(row.media_id), {key: row.video_key, language: row.language, type: row.video_type, name: row.name ?? ''})
            } else if (!row.video_key && age < MISSING_TTL_MS) {
                cache.set(Number(row.media_id), null)
            }
        }
        return cache
    } catch (error) {
        if (isMissingTable(error)) cacheBroken = true
        console.warn('[COLLECTIONS] Trailer cache unavailable', (error as any)?.message ?? error)
        return new Map<number, Trailer | null>()
    }
}

/** Запомнить трейлеры, найденные другим запросом (у сериалов — из карточки с append_to_response=videos). */
export const rememberTrailers = (mediaType: MediaType, results: Array<[number, Trailer | null]>) =>
    writeCache(mediaType, results)

const writeCache = async (mediaType: MediaType, results: Array<[number, Trailer | null]>) => {
    if (cacheBroken || !results.length) return
    // Запись кэша — не главное: её сбой не должен ронять сборку подборки.
    try {
        const {error} = await getSupabase()
            .from('media_trailers')
            .upsert(results.map(([id, trailer]) => ({
                media_type: mediaType,
                media_id: id,
                video_key: trailer?.key ?? null,
                language: trailer?.language ?? null,
                video_type: trailer?.type ?? null,
                name: trailer?.name ?? null,
                checked_at: new Date().toISOString()
            })), {onConflict: 'media_type,media_id'})
        if (error) throw error
    } catch (error) {
        if (isMissingTable(error)) cacheBroken = true
        console.warn('[COLLECTIONS] Trailer cache write failed', (error as any)?.message ?? error)
    }
}

/** Трейлеры для пачки тайтлов (из кэша или TMDB). */
export const findTrailers = async (mediaType: MediaType, ids: number[]): Promise<Map<number, Trailer | null>> => {
    const result = await readCache(mediaType, ids)
    const missing = ids.filter(id => !result.has(id))

    // Не больше 8 запросов сразу (счётчик проверяет до 40 тайтлов на каждый период).
    // Ошибка по одному тайтлу не роняет всю пачку: он считается «без трейлера» и в кэш не пишется.
    const fetched = await mapLimit(missing, 8, async id => {
        try {
            const body = await tmdbGet<{results?: Video[]}>(`${mediaType}/${id}/videos?include_video_language=ru,en`)
            return [id, pickTrailer(body.results ?? [])] as [number, Trailer | null]
        } catch (error) {
            console.warn('[COLLECTIONS] Trailer lookup failed', mediaType, id, error instanceof Error ? error.message : error)
            return null
        }
    })

    const found = fetched.filter((entry): entry is [number, Trailer | null] => Boolean(entry))
    for (const [id, trailer] of found) result.set(id, trailer)
    await writeCache(mediaType, found)
    return result
}
