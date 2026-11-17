import {
    EXCLUDED_GENRES,
    genreByKey,
    MIN_RELEASE_DATE,
    periodByKey,
    type PeriodKey,
    SECTIONS,
    type Section,
    type SectionKey,
    tagByKey,
    type TmdbCondition,
    yearRangeByKey,
    type YearRangeKey
} from '#server/global/engine/collections/catalog'
import {mapLimit, tmdbGet} from '#server/global/engine/collections/tmdb'
import {findTrailers, pickTrailer, rememberTrailers, type Trailer} from '#server/global/engine/collections/trailers'

/**
 * Сборка топа (правки владельца 18.11, см. TASKS.md):
 *   - строго за выбранный период: нашлось 3 — значит 3 (расширения интервала нет);
 *   - жанры и теги: сначала «И», если мало — найденные по «И» наверху, места добираются по «ИЛИ»;
 *   - только тайтлы с русским названием и не старше 1985 года; блок «Год» сужает выход;
 *   - ранжирование как у IMDb/Кинопоиска — по числу голосов; у сериалов, которые ещё выходят,
 *     популярность важнее голосов; у не вышедших — только популярность;
 *   - в топ идут только тайтлы с трейлером (русский, иначе английский).
 */

export type CollectionCriterion = 'filter' | 'popular'

/** and — тайтл подходит под все отмеченные жанры и теги; or — хотя бы под один. */
export type MatchMode = 'and' | 'or'

export type CollectionParams = {
    section: SectionKey
    criterion: CollectionCriterion
    genres?: string[]
    tags?: string[]
    year?: YearRangeKey
    period: PeriodKey
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
    match: MatchMode
    stats: {candidates: number, withoutTrailer: number}
}

export const COLLECTION_SIZE = 10

const MAX_PAGES = 5
/** Голосов у вышедшего тайтла не меньше этого (отсечь совсем неизвестное). */
const MIN_VOTES = {movie: 10, tv: 5}
/** «Скоро»: популярность анонса не ниже (у ожидаемых фильмов до промо она около 2–3). */
const MIN_UPCOMING_POPULARITY = {movie: 1.5, tv: 1}
/** Сериал, который ещё выходит: доля популярности в оценке (остальное — голоса). */
const AIRING_POPULARITY_WEIGHT = 0.7

type Raw = Record<string, any>

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

type Window = {from?: string, to?: string}

const intersect = (...windows: Window[]): Window | null => {
    const from = windows.map(w => w.from).filter(Boolean).sort().at(-1)
    const to = windows.map(w => w.to).filter(Boolean).sort()[0]
    if (from && to && from > to) return null
    return {...(from ? {from} : {}), ...(to ? {to} : {})}
}

const inWindow = (date: string | undefined | null, window: Window) =>
    Boolean(date) && (!window.from || date! >= window.from) && (!window.to || date! <= window.to)

/** Русское название: есть кириллица (или вовсе нет букв — «1917»). «All Elite Wrestling: Dynamite» — нет. */
export const hasRussianTitle = (title: string) =>
    /\p{Script=Cyrillic}/u.test(title) || (!/\p{L}/u.test(title) && /\d/.test(title))

/** Жанры и теги фильтра → условия TMDB для типа раздела. */
export const resolveConditions = (params: CollectionParams): TmdbCondition[] => {
    const section = SECTIONS[params.section]
    if (!section || params.criterion !== 'filter') return []
    return [
        ...(params.genres ?? []).map(key => genreByKey(key)?.[section.mediaType]).filter(Boolean) as TmdbCondition[],
        ...(params.tags ?? []).map(key => tagByKey(key)).filter(Boolean).map(tag => ({keyword: tag!.keyword}))
    ]
}

const splitConditions = (conditions: TmdbCondition[]) => ({
    genres: [...new Set(conditions.flatMap(c => 'genre' in c ? [c.genre] : []))],
    keywords: [...new Set(conditions.flatMap(c => 'keyword' in c ? [c.keyword] : []))]
})

export const distinctConditionCount = (conditions: TmdbCondition[]) => {
    const {genres, keywords} = splitConditions(conditions)
    return genres.length + keywords.length
}

/**
 * Наборы параметров discover для условий (каждый — отдельный запрос, результаты объединяются).
 * and — запятая: все жанры и все теги; or — «|»: любой жанр, отдельным запросом любой тег
 * (жанры и теги в TMDB — разные параметры, между собой всегда «И»).
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

/** Окно дат периода с блоком «Год» и порогом 1985 (для вышедшего). null — пересечения нет. */
export const collectionWindow = (params: CollectionParams): {window: Window, direction: 'released' | 'upcoming'} | null => {
    const period = periodByKey(params.period)
    if (!period) return null
    const year = yearRangeByKey(params.year)
    const window = intersect(
        periodRange(params.period),
        period.direction === 'released' ? {from: MIN_RELEASE_DATE} : {},
        year ? {from: year.from, ...(year.to ? {to: year.to} : {})} : {}
    )
    return window ? {window, direction: period.direction} : null
}

/** Параметры discover раздела: фильтр по датам и сортировка. */
const sectionQuery = (section: Section, window: Window, params: CollectionParams): Record<string, string> => {
    const year = yearRangeByKey(params.year)
    const base: Record<string, string> = {
        language: 'ru-RU',
        include_adult: 'false',
        without_genres: EXCLUDED_GENRES[section.mediaType].join(',')
    }
    const range = (field: string, w: Window) => ({
        ...(w.from ? {[`${field}.gte`]: w.from} : {}),
        ...(w.to ? {[`${field}.lte`]: w.to} : {})
    })

    switch (section.key) {
        case 'movies': {
            const upcoming = periodByKey(params.period)!.direction === 'upcoming'
            return {
                ...base,
                ...range('primary_release_date', window),
                sort_by: upcoming ? 'popularity.desc' : 'vote_count.desc',
                ...(upcoming ? {} : {'vote_count.gte': String(MIN_VOTES.movie)})
            }
        }
        case 'series_completed':
            // Закончен (Ended) или закрыт (Canceled); последняя серия в периоде проверяется по карточке.
            return {
                ...base,
                with_status: '3|4',
                ...range('air_date', periodRange(params.period)),
                ...range('first_air_date', {from: year?.from ?? MIN_RELEASE_DATE, ...(year?.to ? {to: year.to} : {})}),
                sort_by: 'vote_count.desc',
                'vote_count.gte': String(MIN_VOTES.tv)
            }
        case 'series_new':
            // Серии в периоде выходили; что это первая серия сериала или сезона — по карточке.
            return {
                ...base,
                ...range('air_date', periodRange(params.period)),
                ...range('first_air_date', {from: year?.from ?? MIN_RELEASE_DATE, ...(year?.to ? {to: year.to} : {})}),
                include_null_first_air_dates: 'false',
                sort_by: 'popularity.desc'
            }
        case 'series_upcoming':
            return {
                ...base,
                ...range('first_air_date', window),
                sort_by: 'popularity.desc'
            }
    }
}

const tvDetails = (id: number) =>
    tmdbGet<Raw>(`tv/${id}?language=ru-RU&append_to_response=videos&include_video_language=ru,en`)

/** Сериал проходит условие раздела (по карточке). */
const tvFitsSection = (section: Section, details: Raw, window: Window): boolean => {
    switch (section.key) {
        case 'series_completed':
            return ['Ended', 'Canceled'].includes(details.status) && inWindow(details.last_air_date, window)
        case 'series_new':
            return inWindow(details.first_air_date, window) ||
                (details.seasons ?? []).some((season: Raw) => Number(season.season_number) > 0 && inWindow(season.air_date, window))
        default:
            return true
    }
}

type Candidate = {item: Raw, details?: Raw}

/**
 * Кандидаты раздела за период с фильтрами (без проверки трейлеров): discover до 100 штук на
 * набор условий → русское название → у сериалов карточка и условие раздела.
 * capped — в TMDB больше, чем мы смотрим (для счётчика «100+»).
 */
export const collectCandidates = async (
    params: CollectionParams,
    excludeIds: number[] = []
): Promise<{candidates: Candidate[], capped: boolean}> => {
    const section = SECTIONS[params.section]
    const scope = collectionWindow(params)
    if (!section || !scope) return {candidates: [], capped: false}
    const {window, direction} = scope

    const base = sectionQuery(section, window, params)
    const seen = new Set<number>(excludeIds)
    const raw: Raw[] = []
    let capped = false

    for (const conditionSet of conditionParamSets(resolveConditions(params), params.match ?? 'and')) {
        const query = new URLSearchParams({...base, ...conditionSet})
        for (let page = 1; page <= MAX_PAGES; page++) {
            query.set('page', String(page))
            const body = await tmdbGet<{results?: Raw[], total_pages?: number}>(`discover/${section.mediaType}?${query}`)
            for (const item of body.results ?? []) {
                if (seen.has(Number(item.id))) continue
                seen.add(Number(item.id))
                raw.push(item)
            }
            if (!body.total_pages || page >= body.total_pages) break
            if (page === MAX_PAGES) {
                // «Скоро» отсортировано по популярности: если хвост уже ниже порога, дальше тоже — счёт точный.
                const last = body.results?.at(-1)
                const tailUseful = direction === 'released' ||
                    Number(last?.popularity) >= MIN_UPCOMING_POPULARITY[section.mediaType]
                if (tailUseful) capped = true
            }
        }
    }

    const minPopularity = MIN_UPCOMING_POPULARITY[section.mediaType]
    const titled = raw.filter(item =>
        hasRussianTitle(String(item.title || item.name || '')) &&
        (direction === 'released' || Number(item.popularity) >= minPopularity))

    if (section.mediaType === 'movie') return {candidates: titled.map(item => ({item})), capped}

    const withDetails = await mapLimit(titled, 8, async item => ({item, details: await tvDetails(Number(item.id))}))
    return {
        candidates: withDetails.filter(({details}) => tvFitsSection(section, details, window)),
        capped
    }
}

/** Оценка для ранжирования (правило владельца 18.11). */
const rankScore = (candidate: Candidate, direction: 'released' | 'upcoming', maxLogVotes: number, maxLogPopularity: number) => {
    const votes = Number(candidate.item.vote_count) || 0
    const popularity = Number(candidate.item.popularity) || 0
    if (direction === 'upcoming') return popularity

    // Одна шкала 0…1 для всех, иначе завершённые (сырые голоса) всегда выше идущих.
    const votesNorm = Math.log1p(votes) / maxLogVotes
    const status = candidate.details?.status
    const stillAiring = candidate.details && !['Ended', 'Canceled'].includes(status)
    if (!stillAiring) return votesNorm

    const popularityNorm = Math.log1p(popularity) / maxLogPopularity
    return AIRING_POPULARITY_WEIGHT * popularityNorm + (1 - AIRING_POPULARITY_WEIGHT) * votesNorm
}

/** Один проход сборки с заданным режимом условий. */
export const buildCollection = async (
    params: CollectionParams,
    {size = COLLECTION_SIZE, excludeIds = []}: {size?: number, excludeIds?: number[]} = {}
): Promise<CollectionResult> => {
    const section = SECTIONS[params.section]
    if (!section) throw new Error(`[COLLECTIONS] Unknown section: ${params.section}`)
    const match = params.match ?? 'and'
    const scope = collectionWindow(params)
    if (!scope) return {params, items: [], rest: [], match, stats: {candidates: 0, withoutTrailer: 0}}

    const {candidates} = await collectCandidates(params, excludeIds)
    const maxLogVotes = Math.max(1e-9, ...candidates.map(c => Math.log1p(Number(c.item.vote_count) || 0)))
    const maxLogPopularity = Math.max(1e-9, ...candidates.map(c => Math.log1p(Number(c.item.popularity) || 0)))
    const scored = candidates
        .map(candidate => ({candidate, score: rankScore(candidate, scope.direction, maxLogVotes, maxLogPopularity)}))
        .sort((a, b) => b.score - a.score)

    const items: CollectionItem[] = []
    let withoutTrailer = 0
    let cursor = 0

    while (items.length < size && cursor < scored.length) {
        const batch = scored.slice(cursor, cursor + 6)
        cursor += batch.length

        let trailers: Map<number, Trailer | null>
        if (section.mediaType === 'tv') {
            trailers = new Map(batch.map(({candidate}) => [Number(candidate.item.id), pickTrailer(candidate.details?.videos?.results ?? [])]))
            await rememberTrailers('tv', [...trailers.entries()])
        } else {
            trailers = await findTrailers('movie', batch.map(({candidate}) => Number(candidate.item.id)))
        }

        for (const {candidate, score} of batch) {
            const trailer = trailers.get(Number(candidate.item.id))
            if (!trailer) {
                withoutTrailer++
                continue
            }
            if (items.length >= size) break
            const item = candidate.item
            const date = String(item.release_date || item.first_air_date || '')
            items.push({
                rank: items.length + 1,
                mediaType: section.mediaType,
                contentType: section.contentType,
                id: Number(item.id),
                title: String(item.title || item.name),
                ...(date ? {year: Number(date.slice(0, 4))} : {}),
                voteAverage: Number(item.vote_average) || 0,
                voteCount: Number(item.vote_count) || 0,
                popularity: Number(item.popularity) || 0,
                score,
                trailer
            })
        }
    }

    const used = new Set(items.map(item => item.id))
    const lastUsed = scored.findIndex(entry => Number(entry.candidate.item.id) === items.at(-1)?.id)
    const rest = scored
        .slice(lastUsed + 1)
        .filter(entry => !used.has(Number(entry.candidate.item.id)))
        .map(entry => ({id: Number(entry.candidate.item.id), score: entry.score}))

    return {params: {...params, match}, items, rest, match, stats: {candidates: candidates.length, withoutTrailer}}
}

/**
 * Топ за выбранный период: «И»; если мало и условий больше одного — найденные по «И» наверху,
 * свободные места из «ИЛИ». Период не расширяется: нашлось меньше 10 — столько и будет.
 */
export const buildCollectionFor = async (params: CollectionParams, size = COLLECTION_SIZE): Promise<CollectionResult> => {
    const andResult = await buildCollection({...params, match: 'and'}, {size})
    const canUseOr = params.criterion === 'filter' && distinctConditionCount(resolveConditions(params)) > 1
    if (andResult.items.length >= size || !canUseOr) return andResult

    const orResult = await buildCollection({...params, match: 'or'}, {size: size - andResult.items.length, excludeIds: andResult.items.map(item => item.id)})
    if (!orResult.items.length) return andResult
    return {
        ...orResult,
        params: {...params, match: 'or'},
        match: 'or',
        items: [...andResult.items, ...orResult.items].map((item, index) => ({...item, rank: index + 1}))
    }
}

/**
 * Сколько тайтлов найдено за период (для кнопок «До конца года (5)»): без трейлеров и картинок.
 * С несколькими условиями — как в топе: «И», если его мало — объединение с «ИЛИ».
 * capped — больше, чем мы смотрим (кнопка покажет «100+»).
 */
export const countCollection = async (params: CollectionParams): Promise<{count: number, capped: boolean}> => {
    const and = await collectCandidates({...params, match: 'and'})
    const canUseOr = params.criterion === 'filter' && distinctConditionCount(resolveConditions(params)) > 1
    if (and.capped || and.candidates.length >= COLLECTION_SIZE || !canUseOr) {
        return {count: and.candidates.length, capped: and.capped}
    }
    const or = await collectCandidates({...params, match: 'or'}, and.candidates.map(c => Number(c.item.id)))
    return {count: and.candidates.length + or.candidates.length, capped: or.capped}
}
