import {getSupabase} from '#server/global/engine/instagram/reel/jobs/dispatchReelJob'
import {tmdbGet} from '#server/global/engine/collections/tmdb'
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
        // До миграции collections.sql таблицы нет: работаем без кэша.
        cacheBroken = true
        console.warn('[COLLECTIONS] Trailer cache unavailable', error instanceof Error ? error.message : error)
        return new Map<number, Trailer | null>()
    }
}

/** Запомнить трейлеры, найденные другим запросом (у сериалов — из карточки с append_to_response=videos). */
export const rememberTrailers = (mediaType: MediaType, results: Array<[number, Trailer | null]>) =>
    writeCache(mediaType, results)

const writeCache = async (mediaType: MediaType, results: Array<[number, Trailer | null]>) => {
    if (cacheBroken || !results.length) return
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
    if (error) console.warn('[COLLECTIONS] Trailer cache write failed', error.message)
}

/** Трейлеры для пачки тайтлов (из кэша или TMDB). */
export const findTrailers = async (mediaType: MediaType, ids: number[]): Promise<Map<number, Trailer | null>> => {
    const result = await readCache(mediaType, ids)
    const missing = ids.filter(id => !result.has(id))

    const fetched = await Promise.all(missing.map(async id => {
        const body = await tmdbGet<{results?: Video[]}>(`${mediaType}/${id}/videos?include_video_language=ru,en`)
        return [id, pickTrailer(body.results ?? [])] as [number, Trailer | null]
    }))

    for (const [id, trailer] of fetched) result.set(id, trailer)
    await writeCache(mediaType, fetched)
    return result
}
