import {
    EXCLUDED_GENRES,
    genreByKey,
    periodByKey,
    PERIODS,
    type PeriodKey,
    SECTIONS,
    type SectionKey,
    tagByKey,
    type TmdbCondition
} from '#server/global/engine/collections/catalog'
import {tmdbGet} from '#server/global/engine/collections/tmdb'
import {findTrailers, type Trailer} from '#server/global/engine/collections/trailers'

/**
 * Сборка топа: кандидаты из TMDB discover (раздел + фильтр + интервал) → ранжирование →
 * проверка трейлеров по порядку → первые N с трейлером. Без Telegram и без записи в БД
 * (сохранение подборки — в боте).
 */

export type CollectionCriterion = 'filter' | 'popular'

/** and — тайтл подходит под все отмеченные жанры и теги; or — хотя бы под один. */
export type MatchMode = 'and' | 'or'

export type CollectionParams = {
    section: SectionKey
    criterion: CollectionCriterion
    genres?: string[]
    tags?: string[]
    period: PeriodKey
    /** По умолчанию and; buildCollectionWidening сам переходит на or, если and мало. */
    match?: MatchMode
}

export type CollectionItem = {
    rank: number
    mediaType: 'movie' | 'tv'
    contentType: string
    id: number
    title: string
    year?: number
    voteAverage: number
    voteCount: number
    popularity: number
    score: number
    trailer: Trailer
}

export type CollectionResult = {
    params: CollectionParams
    items: CollectionItem[]
    /** Остальные кандидаты после ранжирования — для «Ещё вариант». */
    rest: Array<{id: number, score: number}>
    stats: {candidates: number, checkedTrailers: number, withoutTrailer: number}
}

/** Сколько тайтлов в топе. Минимум для аниме (этап 2) — 7. */
export const COLLECTION_SIZE = 10

const MAX_CANDIDATE_PAGES = 3
const MAX_CANDIDATE_PAGES_UPCOMING = 5

/**
 * Профиль ранжирования интервала. Голоса — для фильмов; у сериалов в TMDB голосов
 * меньше, пороги умножаются на TV_VOTES_FACTOR.
 *   minVotes — отсечь неизвестные тайтлы;
 *   m        — порог взвешенного рейтинга (формула IMDb): меньше голосов — ближе к среднему;
 *   weight   — доля популярности в итоговой оценке (0 — только рейтинг, 1 — только популярность).
 */
type Profile = {minVotes: number, m: number, weight: number}

const PROFILES: Record<PeriodKey, Profile> = {
    all: {minVotes: 1000, m: 3000, weight: 0},
    y5: {minVotes: 300, m: 1000, weight: 0.1},
    year: {minVotes: 100, m: 300, weight: 0.3},
    m6: {minVotes: 40, m: 150, weight: 0.4},
    m3: {minVotes: 15, m: 60, weight: 0.6},
    d30: {minVotes: 3, m: 20, weight: 0.8},
    announced: {minVotes: 0, m: 0, weight: 1},
    year_end: {minVotes: 0, m: 0, weight: 1},
    next_m6: {minVotes: 0, m: 0, weight: 1},
    next_m3: {minVotes: 0, m: 0, weight: 1},
    next_d30: {minVotes: 0, m: 0, weight: 1}
}

const TV_VOTES_FACTOR = 0.3

/**
 * «Скоро»: анонсы с популярностью TMDB ниже этой — совсем незаметные, в топ не берутся.
 * Порог низкий: до начала промо популярность даже у ожидаемых фильмов около 2–3
 * («Тихое место 3» — 2.9, «Зловещие мертвецы: Гнев» — 1.9 на 17.11.2026). Основной
 * мусор отсекает проверка названия (hasReadableTitle).
 */
const MIN_UPCOMING_POPULARITY_MOVIE = 1.5
const MIN_UPCOMING_POPULARITY_TV = 1

/** Название на кириллице или латинице (цифры и знаки допустимы), без букв других письменностей. */
export const hasReadableTitle = (title: string) =>
    /[\p{Script=Latin}\p{Script=Cyrillic}0-9]/u.test(title) &&
    !/[\p{L}--[\p{Script=Latin}\p{Script=Cyrillic}]]/v.test(title)

const pad = (value: number) => String(value).padStart(2, '0')
const isoDate = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
const shift = (days = 0, months = 0, years = 0) => {
    const date = new Date()
    date.setFullYear(date.getFullYear() + years, date.getMonth() + months, date.getDate() + days)
    return date
}

/** Границы дат интервала (включительно). */
export const periodRange = (period: PeriodKey): {from?: string, to?: string} => {
    const today = isoDate(new Date())
    const tomorrow = isoDate(shift(1))
    switch (period) {
        case 'all': return {to: today}
        case 'y5': return {from: isoDate(shift(0, 0, -5)), to: today}
        case 'year': return {from: `${new Date().getFullYear()}-01-01`, to: today}
        case 'm6': return {from: isoDate(shift(0, -6)), to: today}
        case 'm3': return {from: isoDate(shift(0, -3)), to: today}
        case 'd30': return {from: isoDate(shift(-30)), to: today}
        case 'announced': return {from: tomorrow}
        case 'year_end': return {from: tomorrow, to: `${new Date().getFullYear()}-12-31`}
        case 'next_m6': return {from: tomorrow, to: isoDate(shift(0, 6))}
        case 'next_m3': return {from: tomorrow, to: isoDate(shift(0, 3))}
        case 'next_d30': return {from: tomorrow, to: isoDate(shift(30))}
    }
}

const splitConditions = (conditions: TmdbCondition[]) => ({
    genres: [...new Set(conditions.flatMap(c => 'genre' in c ? [c.genre] : []))],
    keywords: [...new Set(conditions.flatMap(c => 'keyword' in c ? [c.keyword] : []))]
})

/** Сколько разных условий TMDB (у сериалов «Боевик» и «Приключения» — один жанр). */
export const distinctConditionCount = (conditions: TmdbCondition[]) => {
    const {genres, keywords} = splitConditions(conditions)
    return genres.length + keywords.length
}

/**
 * Параметры discover для условий. Возвращает список наборов: каждый — отдельный запрос,
 * результаты объединяются.
 *   and — запятая: тайтл содержит все жанры и все теги (один запрос);
 *   or  — вертикальная черта: любой жанр / любой тег. Жанры и теги в TMDB — разные
 *         параметры, между собой они всегда «И», поэтому «любой жанр ИЛИ любой тег» —
 *         два запроса.
 */
const conditionParamSets = (conditions: TmdbCondition[], match: MatchMode): Array<Record<string, string>> => {
    const {genres, keywords} = splitConditions(conditions)
    if (match === 'and') {
        return [{
            ...(genres.length ? {with_genres: genres.join(',')} : {}),
            ...(keywords.length ? {with_keywords: keywords.join(',')} : {})
        }]
    }
    const sets: Array<Record<string, string>> = []
    if (genres.length) sets.push({with_genres: genres.join('|')})
    if (keywords.length) sets.push({with_keywords: keywords.join('|')})
    return sets.length ? sets : [{}]
}

/** Как сортировать кандидатов в TMDB и как оценивать их у нас. */
const strategy = (params: CollectionParams) => {
    const period = periodByKey(params.period)!
    const profile = PROFILES[params.period]

    if (period.direction === 'upcoming') return {sortBy: 'popularity.desc', kind: 'popularity' as const, profile}

    if (params.criterion === 'popular') {
        // «Популярное за всё время / 5 лет» — самое смотрибельное (число оценок); за короткие
        // интервалы — текущая популярность TMDB.
        return params.period === 'all' || params.period === 'y5'
            ? {sortBy: 'vote_count.desc', kind: 'votes' as const, profile}
            : {sortBy: 'popularity.desc', kind: 'popularity' as const, profile}
    }

    return profile.weight >= 0.5
        ? {sortBy: 'popularity.desc', kind: 'weighted' as const, profile}
        : {sortBy: 'vote_average.desc', kind: 'weighted' as const, profile}
}

type Raw = Record<string, any>

/** Жанры и теги фильтра → условия TMDB для типа раздела (фильм или сериал). */
export const resolveConditions = (params: CollectionParams): TmdbCondition[] => {
    const section = SECTIONS[params.section]
    if (!section || params.criterion !== 'filter') return []
    return [
        ...(params.genres ?? []).map(key => genreByKey(key)?.[section.mediaType]).filter(Boolean) as TmdbCondition[],
        ...(params.tags ?? []).map(key => tagByKey(key)).filter(Boolean).map(tag => ({keyword: tag!.keyword}))
    ]
}

export const buildCollection = async (
    params: CollectionParams,
    {size = COLLECTION_SIZE, minSize = COLLECTION_SIZE}: {size?: number, minSize?: number} = {}
): Promise<CollectionResult> => {
    const section = SECTIONS[params.section]
    if (!section) throw new Error(`[COLLECTIONS] Unknown section: ${params.section}`)
    if (!periodByKey(params.period)) throw new Error(`[COLLECTIONS] Unknown period: ${params.period}`)

    const conditions = resolveConditions(params)

    const {sortBy, kind, profile} = strategy(params)
    const votesFactor = section.mediaType === 'tv' ? TV_VOTES_FACTOR : 1
    const minVotes = Math.round(profile.minVotes * votesFactor * (params.criterion === 'popular' ? 0.5 : 1))
    const m = profile.m * votesFactor
    const {from, to} = periodRange(params.period)

    const match: MatchMode = params.match ?? 'and'
    const baseQuery: Record<string, string> = {
        language: 'ru-RU',
        include_adult: 'false',
        sort_by: sortBy,
        without_genres: EXCLUDED_GENRES[section.mediaType].join(','),
        ...(minVotes > 0 ? {'vote_count.gte': String(minVotes)} : {}),
        ...(from ? {[`${section.dateField}.gte`]: from} : {}),
        ...(to ? {[`${section.dateField}.lte`]: to} : {}),
        // У сериалов «новые серии» (air_date) иначе вернут и сериалы без первого показа в истории.
        ...(section.mediaType === 'tv' && section.dateField === 'air_date' ? {include_null_first_air_dates: 'false'} : {})
    }

    // У анонсов трейлер есть далеко не у всех: кандидатов берётся больше.
    const maxPages = periodByKey(params.period)!.direction === 'upcoming' ? MAX_CANDIDATE_PAGES_UPCOMING : MAX_CANDIDATE_PAGES
    const candidates: Raw[] = []
    const seenIds = new Set<number>()
    for (const conditionSet of conditionParamSets(conditions, match)) {
        const query = new URLSearchParams({...baseQuery, ...conditionSet})
        for (let page = 1; page <= maxPages; page++) {
            query.set('page', String(page))
            const body = await tmdbGet<{results?: Raw[], total_pages?: number}>(`discover/${section.mediaType}?${query}`)
            for (const item of body.results ?? []) {
                if (seenIds.has(Number(item.id))) continue
                seenIds.add(Number(item.id))
                candidates.push(item)
            }
            if (!body.total_pages || page >= body.total_pages) break
        }
    }

    // Отсев: тайтлы без русского и английского названия (название только тайской вязью,
    // деванагари, хангылем и т. п.) не для нашей аудитории; у «Скоро» оценок ещё нет, поэтому
    // совсем незаметные анонсы отсекаются по популярности.
    const minUpcomingPopularity = section.mediaType === 'tv' ? MIN_UPCOMING_POPULARITY_TV : MIN_UPCOMING_POPULARITY_MOVIE
    const isUpcoming = periodByKey(params.period)!.direction === 'upcoming'
    const filtered = candidates.filter(item =>
        hasReadableTitle(String(item.title || item.name || '')) &&
        (!isUpcoming || Number(item.popularity) >= minUpcomingPopularity))
    candidates.length = 0
    candidates.push(...filtered)

    // Ранжирование.
    const voted = candidates.filter(item => Number(item.vote_count) > 0)
    const meanRating = voted.length
        ? voted.reduce((sum, item) => sum + Number(item.vote_average), 0) / voted.length
        : 6.5
    const maxLogPopularity = Math.max(1e-9, ...candidates.map(item => Math.log1p(Number(item.popularity) || 0)))

    const scored = candidates.map(item => {
        const v = Number(item.vote_count) || 0
        const r = Number(item.vote_average) || 0
        const popularity = Math.log1p(Number(item.popularity) || 0) / maxLogPopularity
        const weighted = m > 0 ? (v / (v + m)) * r + (m / (v + m)) * meanRating : r
        const score = kind === 'popularity'
            ? popularity
            : kind === 'votes'
                ? v
                : (1 - profile.weight) * (weighted / 10) + profile.weight * popularity
        return {item, score}
    }).sort((a, b) => b.score - a.score)

    // Трейлеры: по порядку, пачками, пока не наберётся size.
    const items: CollectionItem[] = []
    let checked = 0
    let withoutTrailer = 0
    let cursor = 0
    const BATCH = 6

    while (items.length < size && cursor < scored.length) {
        const batch = scored.slice(cursor, cursor + BATCH)
        cursor += batch.length
        const trailers = await findTrailers(section.mediaType, batch.map(entry => Number(entry.item.id)))
        checked += batch.length

        for (const {item, score} of batch) {
            const trailer = trailers.get(Number(item.id))
            if (!trailer) {
                withoutTrailer++
                continue
            }
            if (items.length >= size) break
            const date = String(item.release_date || item.first_air_date || '')
            items.push({
                rank: items.length + 1,
                mediaType: section.mediaType,
                contentType: section.contentType,
                id: Number(item.id),
                title: String(item.title || item.name || item.original_title || item.original_name),
                ...(date ? {year: Number(date.slice(0, 4))} : {}),
                voteAverage: Number(item.vote_average) || 0,
                voteCount: Number(item.vote_count) || 0,
                popularity: Number(item.popularity) || 0,
                score,
                trailer
            })
        }
    }

    const usedIds = new Set(items.map(item => item.id))
    const lastUsed = scored.findIndex(entry => entry.item.id === items.at(-1)?.id)
    const rest = scored
        .slice(lastUsed + 1)
        .filter(entry => !usedIds.has(Number(entry.item.id)))
        .map(entry => ({id: Number(entry.item.id), score: entry.score}))

    if (items.length < minSize) {
        console.warn('[COLLECTIONS] Not enough titles with trailers', {params, found: items.length, candidates: candidates.length})
    }

    return {params, items, rest, stats: {candidates: candidates.length, checkedTrailers: checked, withoutTrailer}}
}

/**
 * Интервалы того же направления, которые шире заданного, от ближайшего к самому широкому.
 * Порядок считается по датам, а не по списку: «Этот год» в январе короче «Последних полугода»,
 * а «До конца года» в ноябре короче «Ближайших 3 месяцев».
 */
export const widerPeriods = (period: PeriodKey): PeriodKey[] => {
    const direction = periodByKey(period)!.direction
    const span = (key: PeriodKey) => {
        const {from, to} = periodRange(key)
        return direction === 'released'
            ? (from ? Date.parse(from) : Number.NEGATIVE_INFINITY)
            : (to ? Date.parse(to) : Number.POSITIVE_INFINITY)
    }
    const baseSpan = span(period)

    return PERIODS
        .filter(other => other.direction === direction && other.key !== period)
        .map(other => other.key)
        .filter(key => direction === 'released' ? span(key) < baseSpan : span(key) > baseSpan)
        .sort((a, b) => direction === 'released' ? span(b) - span(a) : span(a) - span(b))
}

export type WidenedCollectionResult = CollectionResult & {
    requestedPeriod: PeriodKey
    usedPeriod: PeriodKey
    widened: boolean
    /** Каким режимом собран топ: and — все условия, or — хотя бы одно. */
    match: MatchMode
}

/**
 * Топ с запасными шагами (решения владельца 17.11):
 *   1. на заданном интервале — тайтлы со всеми отмеченными жанрами и тегами («И»);
 *   2. мало — на том же интервале с любым из них («ИЛИ»), если условий больше одного;
 *   3. мало и так — следующий, более широкий интервал, снова «И», затем «ИЛИ»; и так до самого широкого.
 * Период пользователя сохраняется, пока это возможно. Если не хватает нигде, возвращается
 * лучшее, что нашлось (карточка показывает «нашлось N»).
 */
export const buildCollectionWidening = async (
    params: CollectionParams,
    {size = COLLECTION_SIZE, minSize = COLLECTION_SIZE}: {size?: number, minSize?: number} = {}
): Promise<WidenedCollectionResult> => {
    const section = SECTIONS[params.section]
    const canUseOr = params.criterion === 'filter' && Boolean(section) &&
        distinctConditionCount(resolveConditions(params)) > 1
    const modes: MatchMode[] = canUseOr ? ['and', 'or'] : ['and']

    let best: CollectionResult | null = null

    for (const period of [params.period, ...widerPeriods(params.period)]) {
        for (const match of modes) {
            const result = await buildCollection({...params, period, match}, {size, minSize})
            if (!best || result.items.length > best.items.length) best = result
            if (result.items.length >= minSize) {
                return {
                    ...result,
                    params: {...params, period, match},
                    requestedPeriod: params.period,
                    usedPeriod: period,
                    widened: period !== params.period,
                    match
                }
            }
        }
    }

    const usedPeriod = best!.params.period
    return {...best!, requestedPeriod: params.period, usedPeriod, widened: usedPeriod !== params.period, match: best!.params.match ?? 'and'}
}
