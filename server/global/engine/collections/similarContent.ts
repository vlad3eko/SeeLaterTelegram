import {mapLimit, tmdbGet} from '#server/global/engine/collections/tmdb'
import {fitsShelf, type MediaType, shelfExcludedGenres, shelfOf, SHELVES} from '#server/global/engine/collections/shelves'
import {buildCacheKey, getCacheMany, saveCacheMany} from '#server/global/engine/search/repository/cacheRepository'

/**
 * «Похожие» на странице тайтла сайта: похожие по содержанию (сюжет и темы), а не по поведению
 * зрителей — то делает блок «Рекомендуем посмотреть» (TMDB recommendations), его не дублируем.
 *
 * TMDB /similar сам по себе шумный (жанры + любое общее слово, без сортировки по сходству:
 * к «Человеку-пауку: Нет пути домой» — «Шафт» 1971 года, аниме и «Зверополис»), поэтому:
 *  1. Кандидаты: /similar (2 страницы) + discover по ключевым словам тайтла (2 страницы).
 *  2. Жёсткие фильтры: та же полка (живое кино к живому, мультфильм к мультфильмам, аниме к аниме),
 *     голосов не меньше половины порога «известного», хотя бы один общий жанр, не старше тайтла
 *     больше чем на MAX_YEARS_OLDER (новее — можно), не из исключённых (рекомендации, франшиза).
 *  3. Ключевые слова кандидатов (кэш на 30 дней, пакетно) — не меньше MIN_SHARED общих.
 *  4. Оценка: доля общих слов (Жаккар) 0.6, общие жанры 0.25, язык оригинала 0.1, близость лет 0.05.
 * Сколько прошло фильтры — столько и показываем (решение владельца 24.11.2026: без добора).
 *
 * Запросы к TMDB на холодный тайтл: карточка + 4 страницы кандидатов + ключевые слова
 * до MAX_CANDIDATES кандидатов, которых ещё нет в кэше. Итог кэшируется роутом на 3 дня.
 */

type Raw = Record<string, any>

const MAX_YEARS_OLDER = 20
const MAX_CANDIDATES = 40
const MAX_RESULTS = 20
const MIN_SHARED = 2
const STRONG_SHARED = 3
const KEYWORDS_TTL_DAYS = 30

/** Служебные и слишком общие ключевые слова TMDB: совпадение по ним ничего не говорит о сюжете. */
const NOISE_KEYWORDS = new Set([
    'aftercreditsstinger', 'duringcreditsstinger', 'sequel', 'prequel', 'remake', 'reboot',
    'based on comic', 'based on novel or book', 'based on manga', 'based on video game',
    'based on true story', 'woman director', '3d', 'imax', 'anime', 'live action remake',
])

const yearOf = (item: Raw): number | undefined => {
    const year = Number(String(item.release_date || item.first_air_date || '').slice(0, 4))
    return year > 1800 ? year : undefined
}

/** Ключевые слова без шума: у фильмов TMDB кладёт их в keywords, у сериалов — в results. */
const keywordsOf = (body: Raw | undefined): Array<{id: number, name: string}> =>
    ((body?.keywords ?? body?.results ?? []) as Raw[])
        .map(keyword => ({id: Number(keyword.id), name: String(keyword.name || '')}))
        .filter(keyword => keyword.id && !NOISE_KEYWORDS.has(keyword.name.toLowerCase()))

/** Ключевые слова кандидатов: сначала кэш одним запросом, недостающие — из TMDB, затем одна запись. */
const loadKeywords = async (event: any, media: MediaType, ids: number[]): Promise<Map<number, number[]>> => {
    const keyOf = (id: number) => buildCacheKey('keywords', {media, id})
    const cached = await getCacheMany(event, ids.map(keyOf))
    const result = new Map<number, number[]>()
    const missing: number[] = []

    for (const id of ids) {
        const body = cached.get(keyOf(id))
        if (body && Array.isArray(body.ids)) result.set(id, body.ids)
        else missing.push(id)
    }

    const fresh = await mapLimit(missing, 8, async (id) => {
        try {
            const body = await tmdbGet<Raw>(`${media}/${id}/keywords`)
            return {id, ids: keywordsOf(body).map(keyword => keyword.id)}
        } catch {
            return null
        }
    })

    const toSave: Array<{cacheKey: string, response: any}> = []
    for (const entry of fresh) {
        if (!entry) continue
        result.set(entry.id, entry.ids)
        toSave.push({cacheKey: keyOf(entry.id), response: {ids: entry.ids}})
    }
    await saveCacheMany(event, 'keywords', toSave, KEYWORDS_TTL_DAYS)

    return result
}

export const buildSimilarContent = async (
    event: any,
    base: {mediaType: MediaType, id: number},
    exclude: Set<number>
): Promise<Raw[]> => {
    const media = base.mediaType
    const details = await tmdbGet<Raw>(`${media}/${base.id}?language=ru-RU&append_to_response=keywords`)

    const baseKeywords = new Set(keywordsOf(details.keywords).map(keyword => keyword.id))
    // Без ключевых слов о сюжете ничего не известно — блок не показываем.
    if (!baseKeywords.size) return []

    const baseGenres = new Set(((details.genres ?? []) as Raw[]).map(genre => Number(genre.id)))
    const baseYear = yearOf(details)
    const shelf = SHELVES[shelfOf(details, media)]
    const minVotes = Math.round(shelf.knownVotes * 0.5)
    const minShared = Math.min(MIN_SHARED, baseKeywords.size)

    const pageOf = (path: string) => tmdbGet<{results?: Raw[]}>(path).then(body => body.results ?? []).catch(() => [] as Raw[])
    const discoverQuery = (page: number) => new URLSearchParams({
        language: 'ru-RU',
        with_keywords: [...baseKeywords].join('|'),
        without_genres: shelfExcludedGenres(shelf).join(','),
        'vote_count.gte': String(minVotes),
        sort_by: 'vote_count.desc',
        page: String(page),
    })
    const lists = await Promise.all([
        pageOf(`${media}/${base.id}/similar?language=ru-RU&page=1`),
        pageOf(`${media}/${base.id}/similar?language=ru-RU&page=2`),
        pageOf(`discover/${media}?${discoverQuery(1)}`),
        pageOf(`discover/${media}?${discoverQuery(2)}`),
    ])

    const pool = new Map<number, Raw>()
    for (const item of lists.flat()) {
        const id = Number(item.id)
        if (!id || id === base.id || exclude.has(id) || pool.has(id)) continue
        const year = yearOf(item)
        const genres = (item.genre_ids ?? []) as number[]
        if (!item.poster_path) continue
        if ((Number(item.vote_count) || 0) < minVotes) continue
        if (!fitsShelf(item, shelf)) continue
        if (baseGenres.size && !genres.some(genre => baseGenres.has(Number(genre)))) continue
        if (baseYear && (!year || year < baseYear - MAX_YEARS_OLDER)) continue
        pool.set(id, {...item, media_type: media})
    }

    // Ключевые слова тянем только у самых обсуждаемых кандидатов — это ограничивает запросы к TMDB.
    const candidates = [...pool.values()]
        .sort((a, b) => (Number(b.vote_count) || 0) - (Number(a.vote_count) || 0))
        .slice(0, MAX_CANDIDATES)

    const keywords = await loadKeywords(event, media, candidates.map(item => Number(item.id)))

    return candidates
        .map(item => {
            const own = keywords.get(Number(item.id)) ?? []
            const shared = own.filter(id => baseKeywords.has(id)).length
            const union = new Set([...baseKeywords, ...own]).size || 1
            const sharedGenres = ((item.genre_ids ?? []) as number[]).filter(id => baseGenres.has(Number(id))).length
            const year = yearOf(item)
            const yearGap = baseYear && year ? Math.abs(baseYear - year) : MAX_YEARS_OLDER
            const score =
                0.6 * (shared / union) +
                0.25 * (baseGenres.size ? sharedGenres / baseGenres.size : 0) +
                0.1 * (item.original_language === details.original_language ? 1 : 0) +
                0.05 * Math.max(0, 1 - yearGap / MAX_YEARS_OLDER)
            return {item, shared, sharedGenres, score}
        })
        // Один общий жанр из нескольких («Убить Билла 2» к «Человеку-пауку» — только боевик)
        // пропускаем лишь при сильном совпадении сюжета: не меньше STRONG_SHARED общих слов.
        .filter(entry => entry.shared >= minShared &&
            (entry.sharedGenres >= Math.min(2, baseGenres.size) || entry.shared >= STRONG_SHARED))
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_RESULTS)
        .map(entry => entry.item)
}
