import type {Bundle, GenreRule, Range} from '#server/global/engine/collections/bundles'
import type {Shelf} from '#server/global/engine/collections/shelves'

/**
 * Правила связки → запрос discover и точная проверка тайтла. Чистые функции (тесты — без сети).
 *
 * Discover получает заведомо широкую выборку: одно понятие ключевых слов («или»), жанры и
 * свойства, которые TMDB фильтрует сам. Остальное (несколько понятий, «все жанры» поверх
 * жанра полки, число серий, верхняя граница голосов) проверяется у нас.
 */

type Raw = Record<string, any>

/** Статусы сериалов TMDB → значения with_status. */
const TV_STATUS: Record<string, string> = {
    'Returning Series': '0', 'Planned': '1', 'In Production': '2', 'Ended': '3', 'Canceled': '4', 'Pilot': '5'
}

const inRange = (value: number, range: Range | undefined) =>
    !range || ((range.min === undefined || value >= range.min) && (range.max === undefined || value <= range.max))

/** Голоса: множители связки × порог «известного» на полке. */
export const votesRange = (bundle: Bundle, shelf: Shelf): Range | undefined => {
    const votes = bundle.criteria.props?.votes
    if (!votes) return undefined
    return {
        ...(votes.min !== undefined ? {min: Math.round(votes.min * shelf.knownVotes)} : {}),
        ...(votes.max !== undefined ? {max: Math.round(votes.max * shelf.knownVotes)} : {})
    }
}

export type BundleQuery = {
    params: Record<string, string>
    /** Жанры, которые нужно исключить вдобавок к жанрам полки. */
    withoutGenres: number[]
    /** Discover сам по себе не гарантирует правило — нужна проверка по ключевым словам тайтла. */
    needsKeywords: boolean
}

/** Параметры discover по связке (без дат раздела и полки). */
export const bundleQuery = (bundle: Bundle, shelf: Shelf): BundleQuery => {
    const {concepts = [], exclude = [], boost = [], props} = bundle.criteria
    const genre: GenreRule | undefined = bundle.criteria.genres?.[shelf.mediaType]
    const params: Record<string, string> = {}

    if (concepts.length) {
        // Самое узкое понятие — в запрос, остальные проверяются по ключевым словам.
        const anchor = [...concepts].sort((a, b) => a.length - b.length)[0]!
        params.with_keywords = [...new Set(anchor)].join('|')
    }
    if (exclude.length) params.without_keywords = exclude.join(',')

    if (genre?.allOf?.length) params.with_genres = genre.allOf.join(',')
    else if (genre?.anyOf?.length) params.with_genres = genre.anyOf.join('|')

    if (props?.runtime && shelf.mediaType === 'movie') {
        if (props.runtime.min !== undefined) params['with_runtime.gte'] = String(props.runtime.min)
        if (props.runtime.max !== undefined) params['with_runtime.lte'] = String(props.runtime.max)
    }
    if (props?.tvType === 'miniseries' && shelf.mediaType === 'tv') params.with_type = '2'
    if (props?.status?.length && shelf.mediaType === 'tv') {
        params.with_status = props.status.map(status => TV_STATUS[status]).filter(Boolean).join('|')
    }
    if (props?.rating?.min !== undefined) params['vote_average.gte'] = String(props.rating.min)
    if (props?.rating?.max !== undefined) params['vote_average.lte'] = String(props.rating.max)
    const votes = votesRange(bundle, shelf)
    if (votes?.min !== undefined) params['vote_count.gte'] = String(votes.min)
    if (votes?.max !== undefined) params['vote_count.lte'] = String(votes.max)

    return {
        params,
        withoutGenres: genre?.exclude ?? [],
        needsKeywords: concepts.length > 1 || exclude.length > 0 || (bundle.ranking === 'relevance' && boost.length > 0)
    }
}

const dateOf = (item: Raw, details?: Raw) =>
    String(details?.release_date || details?.first_air_date || item.release_date || item.first_air_date || '')

/**
 * Точная проверка тайтла. keywords — null, если не загружались (тогда проверки по словам
 * пропускаются: discover уже гарантировал якорное понятие). details — карточка сериала.
 */
export const bundleMatches = (
    bundle: Bundle,
    shelf: Shelf,
    item: Raw,
    keywords: number[] | null,
    details?: Raw
): boolean => {
    const {concepts = [], exclude = [], props} = bundle.criteria
    const genres = new Set<number>(((item.genre_ids ?? details?.genres?.map((g: Raw) => g.id) ?? []) as number[]).map(Number))
    const rule = bundle.criteria.genres?.[shelf.mediaType]
    if (rule?.allOf?.length && !rule.allOf.every(id => genres.has(id))) return false
    if (rule?.anyOf?.length && !rule.anyOf.some(id => genres.has(id))) return false
    if (rule?.exclude?.some(id => genres.has(id))) return false

    if (keywords) {
        const set = new Set(keywords)
        if (!concepts.every(concept => concept.some(id => set.has(id)))) return false
        if (exclude.some(id => set.has(id))) return false
    }

    if (!inRange(Number(item.vote_average) || 0, props?.rating)) return false
    if (!inRange(Number(item.vote_count) || 0, votesRange(bundle, shelf))) return false

    const date = dateOf(item, details)
    if (props?.released) {
        if (!date) return false
        if (props.released.from && date < props.released.from) return false
        if (props.released.to && date > props.released.to) return false
    }

    if (shelf.mediaType === 'tv' && details) {
        if (props?.episodes && !inRange(Number(details.number_of_episodes) || 0, props.episodes)) return false
        if (props?.status?.length && !props.status.includes(String(details.status))) return false
        if (props?.tvType === 'miniseries' && details.type && details.type !== 'Miniseries') return false
    }
    if (shelf.mediaType === 'movie' && props?.runtime && details?.runtime) {
        if (!inRange(Number(details.runtime), props.runtime)) return false
    }
    return true
}

/** Средняя оценка выборки — «C» байесовского рейтинга. */
export const meanRating = (items: Raw[]) => {
    const rated = items.map(item => Number(item.vote_average) || 0).filter(value => value > 0)
    return rated.length ? rated.reduce((sum, value) => sum + value, 0) / rated.length : 6.5
}

/** Байесовский рейтинг (как IMDb Top 250): мало голосов — оценка тянется к средней по выборке. */
export const weightedRating = (voteAverage: number, voteCount: number, minVotes: number, mean: number) =>
    (voteCount / (voteCount + minVotes)) * voteAverage + (minVotes / (voteCount + minVotes)) * mean

/**
 * Оценка тайтла в связке, 0…~1.3:
 *   weighted  — байесовский рейтинг / 10;
 *   popular   — популярность (лог, нормирована на выборку);
 *   relevance — байесовский рейтинг + усиливающие слова и лишние совпадения понятий.
 */
export const bundleScore = (
    bundle: Bundle,
    shelf: Shelf,
    item: Raw,
    keywords: number[] | null,
    context: {mean: number, maxLogPopularity: number}
): number => {
    const wr = weightedRating(Number(item.vote_average) || 0, Number(item.vote_count) || 0, shelf.knownVotes, context.mean) / 10
    if (bundle.ranking === 'weighted') return wr
    if (bundle.ranking === 'popular') return Math.log1p(Number(item.popularity) || 0) / context.maxLogPopularity
    const set = new Set(keywords ?? [])
    const boostHits = (bundle.criteria.boost ?? []).filter(id => set.has(id)).length
    const conceptHits = (bundle.criteria.concepts ?? []).flat().filter(id => set.has(id)).length
    const votesWeight = Math.min(1, Math.log1p(Number(item.vote_count) || 0) / Math.log1p(shelf.knownVotes * 10))
    return 0.6 * wr + 0.25 * votesWeight + 0.1 * Math.min(boostHits, 2) + 0.03 * Math.min(Math.max(conceptHits - 1, 0), 3)
}

