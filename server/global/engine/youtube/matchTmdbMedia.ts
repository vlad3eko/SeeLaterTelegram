import {normalizeTmdbMedia} from '~/utils/media/normalizeTmdbMedia'

/**
 * Фильм или сериал TMDB по названию ролика вида
 *   «Девять жизней кота Нерона — Русский трейлер (Дубляж, 4K, 2027)»
 *   «Мстители 5: Доктор Дум — «Замок Доктора Дума» (Субтитры, 4K, 2026)».
 * Название — всё до первого тире, год — последнее четырёхзначное число в скобках.
 */

export type ParsedTrailerTitle = {
    name: string
    year?: number
}

export const parseTrailerTitle = (title: string): ParsedTrailerTitle | null => {
    const name = title.split(/\s+[—–-]\s+/)[0]?.replace(/\s+/g, ' ').trim() ?? ''
    if (!name) return null

    const brackets = [...title.matchAll(/\(([^()]*)\)/g)].map(match => match[1]!).join(' ')
    const years = [...brackets.matchAll(/\b(19\d{2}|20\d{2})\b/g)].map(match => Number(match[1]))
    const year = years.at(-1)

    return {name, ...(year ? {year} : {})}
}

const normalize = (value: string | undefined) =>
    String(value ?? '')
        .toLowerCase()
        .replace(/ё/g, 'е')
        .replace(/[«»"'“”„:;,.!?()[\]–—-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()

const yearOf = (item: Record<string, any>) => {
    const date = String(item.release_date || item.first_air_date || '')
    const year = Number(date.slice(0, 4))
    return Number.isFinite(year) && year > 0 ? year : undefined
}

export type MatchedMedia = {
    mediaId: number
    mediaType: 'movie' | 'tv'
    contentType: string
    /** Полный объект TMDB (как у /api/bot/getMediaBot), для карточки и подписи. */
    media: Record<string, any>
    tmdbTitle: string
}

const tmdbFetch = async (pathAndQuery: string) => {
    const apiKey = process.env.TMDB_API_KEY?.trim()
    if (!apiKey) throw new Error('[YOUTUBE MATCH] TMDB_API_KEY is missing')

    const response = await fetch(`https://api.themoviedb.org/3/${pathAndQuery}`, {
        headers: {accept: 'application/json', Authorization: `Bearer ${apiKey}`},
        signal: AbortSignal.timeout(20_000)
    })
    if (!response.ok) throw new Error(`[YOUTUBE MATCH] TMDB HTTP ${response.status}`)
    return await response.json() as Record<string, any>
}

/**
 * Лучшее совпадение или null. Принимается только точное совпадение названия (русского или
 * оригинального); при нескольких — то, у которого год ближе к году из ролика, затем популярнее.
 * Без точного названия ничего не публикуется: лучше пропустить ролик, чем выложить чужой фильм.
 */
export const matchTmdbMedia = async (parsed: ParsedTrailerTitle): Promise<MatchedMedia | null> => {
    const params = new URLSearchParams({query: parsed.name, language: 'ru-RU', include_adult: 'false', page: '1'})
    const search = await tmdbFetch(`search/multi?${params}`)
    const wanted = normalize(parsed.name)

    const candidates = (search.results ?? [])
        .filter((item: Record<string, any>) => item.media_type === 'movie' || item.media_type === 'tv')
        .filter((item: Record<string, any>) =>
            [item.title, item.name, item.original_title, item.original_name].some(value => normalize(value) === wanted))
        .map((item: Record<string, any>) => {
            const year = yearOf(item)
            const distance = parsed.year && year ? Math.abs(parsed.year - year) : parsed.year ? 50 : 0
            return {item, distance}
        })
        // Год из ролика, если он есть, должен быть близок: трейлер выходит до премьеры или в её год.
        .filter(({distance}: {distance: number}) => distance <= 2)
        .sort((a: any, b: any) => a.distance - b.distance || (b.item.popularity ?? 0) - (a.item.popularity ?? 0))

    const best = candidates[0]?.item
    if (!best) return null

    const mediaType = best.media_type as 'movie' | 'tv'
    const media = await tmdbFetch(`${mediaType}/${Number(best.id)}?language=ru-RU`)
    const contentType = normalizeTmdbMedia(best).content_type

    return {
        mediaId: Number(best.id),
        mediaType,
        contentType,
        media,
        tmdbTitle: String(best.title || best.name || parsed.name)
    }
}
