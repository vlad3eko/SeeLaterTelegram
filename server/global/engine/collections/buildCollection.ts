import {
    genreByKey,
    isExcludedOrigin,
    MIN_RELEASE_DATE,
    periodAllowed,
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
import {fitsShelf, type Shelf, shelfByKey, type ShelfKey, shelfQuery, SHELVES} from '#server/global/engine/collections/shelves'
import {type Bundle, bundleByKey, bundleFits, bundlesFor, rubricOf} from '#server/global/engine/collections/bundles'
import {bundleMatches, bundleQuery, bundleScore, meanRating} from '#server/global/engine/collections/bundleRules'
import {getBundleStore, type VerdictRow} from '#server/global/engine/collections/judge/store'

/**
 * Сборка топа (правки владельца 18.11, см. TASKS.md):
 *   - строго за выбранный период: нашлось 3 — значит 3 (расширения интервала нет);
 *   - жанры и теги (правка 19.11): между группами всегда «И»; внутри группы сначала все отмеченные,
 *     если мало — найденные так наверху, места добираются тайтлами с любым из отмеченных;
 *   - только тайтлы с русским названием и не старше 1985 года; блок «Год» сужает выход;
 *   - ранжирование как у IMDb/Кинопоиска — по числу голосов; у сериалов, которые ещё выходят,
 *     популярность важнее голосов; у не вышедших — только популярность;
 *   - в топ идут только тайтлы с трейлером (русский, иначе английский).
 */

export type CollectionCriterion = 'filter' | 'popular' | 'bundle'

/**
 * Внутри группы (жанры, теги): and — все отмеченные, or — любой из отмеченных.
 * Между группами — всегда «И»: тайтл должен подойти и под жанры, и под теги.
 */
export type MatchMode = 'and' | 'or'

export type CollectionParams = {
    section: SectionKey
    criterion: CollectionCriterion
    genres?: string[]
    tags?: string[]
    year?: YearRangeKey
    period: PeriodKey
    match?: MatchMode
    /** Полка (мультфильмы, аниме…); без неё — живое кино типа раздела. */
    shelf?: ShelfKey
    /** Связка (criterion 'bundle'). */
    bundle?: string
}

/** Полка подборки: явная, если её тип совпадает с разделом, иначе живое кино типа раздела. */
export const shelfForParams = (params: Pick<CollectionParams, 'section' | 'shelf'>): Shelf => {
    const mediaType = SECTIONS[params.section]?.mediaType ?? 'movie'
    const shelf = shelfByKey(params.shelf)
    return shelf && shelf.mediaType === mediaType ? shelf : SHELVES[mediaType === 'tv' ? 'series' : 'movie']
}

/** Связка подборки (только при criterion 'bundle'). */
export const bundleForParams = (params: Pick<CollectionParams, 'criterion' | 'bundle'>): Bundle | undefined =>
    params.criterion === 'bundle' ? bundleByKey(params.bundle) : undefined

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
        case 'd7': return {from: isoDate(shift(-7)), to: today}
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

/*
 * Фильтр как у фасетного поиска (решение владельца 19.11):
 *   - понятие — жанр или тег; тег — несколько ключевых слов TMDB через «или» (синонимы);
 *   - между группами (жанры × теги) — всегда «И»;
 *   - внутри группы: and — все отмеченные понятия, or — любое (запасной шаг, если по and мало).
 * В одном параметре TMDB смешанное «(a|b),c» работает ненадёжно (проверено: теряет тайтлы),
 * поэтому discover получает заведомо широкую выборку, а точное правило проверяется у нас
 * по жанрам и ключевым словам тайтла (matchesFilter).
 */

/** Понятие: подходит, если у тайтла есть любой из жанров или любое из ключевых слов. */
type Concept = {genres: number[], keywords: number[]}

type FilterGroups = {genres: Concept[], tags: Concept[]}

const conceptOf = (condition: TmdbCondition): Concept =>
    'genre' in condition ? {genres: [condition.genre], keywords: []} : {genres: [], keywords: [condition.keyword]}

/** Жанры и теги фильтра → понятия для типа раздела. */
export const resolveFilter = (params: CollectionParams): FilterGroups => {
    const section = SECTIONS[params.section]
    if (!section || params.criterion !== 'filter') return {genres: [], tags: []}
    return {
        genres: (params.genres ?? [])
            .map(key => genreByKey(key)?.[section.mediaType])
            .filter((condition): condition is TmdbCondition => Boolean(condition))
            .map(conceptOf),
        tags: (params.tags ?? [])
            .map(key => tagByKey(key))
            .filter(tag => Boolean(tag))
            .map(tag => ({genres: [], keywords: tag!.keywords}))
    }
}

/** Есть ли смысл в запасном шаге or: в какой-то группе отмечено больше одного понятия. */
export const canRelaxFilter = (params: CollectionParams) => {
    const {genres, tags} = resolveFilter(params)
    return params.criterion === 'filter' && (genres.length > 1 || tags.length > 1)
}

const conceptMatches = (concept: Concept, genres: Set<number>, keywords: Set<number>) =>
    concept.genres.some(id => genres.has(id)) || concept.keywords.some(id => keywords.has(id))

const groupMatches = (group: Concept[], match: MatchMode, genres: Set<number>, keywords: Set<number>) =>
    !group.length || (match === 'and'
        ? group.every(concept => conceptMatches(concept, genres, keywords))
        : group.some(concept => conceptMatches(concept, genres, keywords)))

/** Точное правило фильтра для тайтла (жанры — из discover, ключевые слова — из карточки). */
const matchesFilter = (filter: FilterGroups, match: MatchMode, genreIds: number[], keywordIds: number[]) => {
    const genres = new Set(genreIds)
    const keywords = new Set(keywordIds)
    return groupMatches(filter.genres, match, genres, keywords) && groupMatches(filter.tags, match, genres, keywords)
}

/**
 * Параметры discover — широкая выборка, в которой точно есть все подходящие тайтлы, и флаг,
 * нужна ли проверка по ключевым словам (exact — выборка совпадает с правилом).
 */
const filterQuery = (filter: FilterGroups, match: MatchMode): {params: Record<string, string>, exact: boolean} => {
    const params: Record<string, string> = {}
    let exact = true

    // Жанры-жанры TMDB: and — запятая, or — «|». Жанр-ключевое слово (у фильмов «Мистика» и т. п.)
    // в эту строку не входит и проверяется по ключевым словам.
    const pureGenres = filter.genres.filter(concept => concept.genres.length && !concept.keywords.length)
    const keywordGenres = filter.genres.filter(concept => concept.keywords.length)
    if (pureGenres.length && (match === 'and' || !keywordGenres.length)) {
        params.with_genres = pureGenres.map(concept => concept.genres[0]).join(match === 'and' ? ',' : '|')
    }
    if (match === 'or' && pureGenres.length && keywordGenres.length) exact = false

    // Ключевые слова: в запрос — одно необходимое условие, остальное проверяем сами.
    const keywordConcepts = match === 'and'
        ? [...keywordGenres, ...filter.tags]
        : filter.tags.length ? [{genres: [], keywords: filter.tags.flatMap(concept => concept.keywords)}] : []
    if (match === 'or' && keywordGenres.length && !pureGenres.length && !filter.tags.length) {
        keywordConcepts.push({genres: [], keywords: keywordGenres.flatMap(concept => concept.keywords)})
    }
    if (match === 'or' && keywordGenres.length && filter.tags.length) exact = false
    if (keywordConcepts.length) {
        if (keywordConcepts.every(concept => concept.keywords.length === 1)) {
            params.with_keywords = keywordConcepts.map(concept => concept.keywords[0]).join(',')
        } else {
            // Самое узкое по числу слов понятие — в запрос, остальные — проверкой.
            const anchor = [...keywordConcepts].sort((a, b) => a.keywords.length - b.keywords.length)[0]!
            params.with_keywords = [...new Set(anchor.keywords)].join('|')
            if (keywordConcepts.length > 1) exact = false
        }
    }
    return {params, exact}
}

/** Ключевые слова тайтла (у сериалов — из карточки, у фильмов — отдельным запросом). */
const keywordIdsOf = (details: Raw | undefined): number[] =>
    (details?.keywords?.results ?? details?.keywords?.keywords ?? []).map((keyword: Raw) => Number(keyword.id))

const movieKeywords = async (id: number): Promise<number[]> =>
    keywordIdsOf({keywords: await tmdbGet<Raw>(`movie/${id}/keywords`)})

/**
 * Окно дат периода с порогом 1985 (для вышедшего). null — пересечения нет.
 * «Год» — год выхода фильма или начала сериала. У фильмов он сужает окно выхода. У вышедших
 * сериалов окно — это даты последней серии или нового сезона, а «Год» проверяется по первой
 * серии (discover first_air_date): сериал 2000–2015, закончившийся в 2019, подходит.
 */
export const collectionWindow = (params: CollectionParams): {window: Window, direction: 'released' | 'upcoming'} | null => {
    const period = periodByKey(params.period)
    const section = SECTIONS[params.section]
    if (!period || !section || !periodAllowed(section, period.key)) return null
    const bundle = bundleForParams(params)
    if (params.criterion === 'bundle' && (!bundle || !bundleFits(bundle, shelfForParams(params).key, section.key))) return null
    const released = section.mediaType === 'movie' ? bundle?.criteria.props?.released : undefined
    const year = yearRangeByKey(params.year)
    const yearIsStart = section.mediaType === 'tv' && period.direction === 'released'
    const window = intersect(
        periodRange(params.period),
        period.direction === 'released' ? {from: MIN_RELEASE_DATE} : {},
        year && !yearIsStart ? {from: year.from, ...(year.to ? {to: year.to} : {})} : {},
        released ?? {}
    )
    if (!window) return null
    // Сериал не может закончиться или выйти новым сезоном раньше, чем начался.
    if (year && yearIsStart && window.to && year.from > window.to) return null
    return {window, direction: period.direction}
}

/** Параметры discover раздела: фильтр по датам и сортировка. */
const sectionQuery = (section: Section, window: Window, params: CollectionParams, shelf: Shelf, extraWithout: number[] = []): Record<string, string> => {
    const year = yearRangeByKey(params.year)
    const shelfParams = shelfQuery(shelf)
    const base: Record<string, string> = {
        language: 'ru-RU',
        include_adult: 'false',
        without_genres: [...new Set([...shelfParams.without_genres!.split(','), ...extraWithout.map(String)])].join(','),
        ...(shelfParams.with_origin_country ? {with_origin_country: shelfParams.with_origin_country} : {})
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
            // Серии в периоде выходили; последняя вышедшая серия в периоде — по карточке.
            return {
                ...base,
                ...range('air_date', periodRange(params.period)),
                ...range('first_air_date', {from: year?.from ?? MIN_RELEASE_DATE, ...(year?.to ? {to: year.to} : {})}),
                include_null_first_air_dates: 'false',
                sort_by: 'popularity.desc'
            }
        case 'series_seasons': {
            // Серии в периоде выходили, а сам сериал начался раньше периода (новые сериалы отсекаем
            // ещё в запросе); что в периоде стартовал именно сезон — по карточке.
            const period = periodRange(params.period)
            const startedBefore = period.from
                ? new Date(Date.parse(period.from) - 864e5).toISOString().slice(0, 10)
                : undefined
            const to = [year?.to, startedBefore].filter(Boolean).sort()[0]
            return {
                ...base,
                ...range('air_date', period),
                ...range('first_air_date', {from: year?.from ?? MIN_RELEASE_DATE, ...(to ? {to} : {})}),
                include_null_first_air_dates: 'false',
                sort_by: 'popularity.desc'
            }
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
    tmdbGet<Raw>(`tv/${id}?language=ru-RU&append_to_response=videos,keywords&include_video_language=ru,en`)

/** Сериал проходит условие раздела (по карточке). */
const tvFitsSection = (section: Section, details: Raw, window: Window): boolean => {
    switch (section.key) {
        case 'series_completed':
            return ['Ended', 'Canceled'].includes(details.status) && inWindow(details.last_air_date, window)
        case 'series_new':
            // В периоде выходили серии: последняя вышедшая серия в периоде (сериал мог стартовать
            // раньше и даже уже закончиться — «Квест Вижна»: премьера 13.10, финал 11.11), либо
            // в периоде премьера сериала или сезона.
            return inWindow(details.last_air_date, window) ||
                inWindow(details.first_air_date, window) ||
                (details.seasons ?? []).some((season: Raw) => Number(season.season_number) > 0 && inWindow(season.air_date, window))
        case 'series_seasons':
            // В периоде вышла первая серия сезона 2 и дальше; сам сериал начался раньше периода.
            return !inWindow(details.first_air_date, window) &&
                (details.seasons ?? []).some((season: Raw) => Number(season.season_number) > 1 && inWindow(season.air_date, window))
        default:
            return true
    }
}

export type Candidate = {item: Raw, details?: Raw, keywords?: number[] | null, judgeScore?: number}

/**
 * Несколько условий with_genres в один параметр: «и» (запятая) склеиваются; условие «или» («|»)
 * вместе с другими TMDB понимает ненадёжно — оно уходит в проверку у нас (exact = false).
 */
export const mergeGenres = (parts: Array<string | undefined>): {value?: string, exact: boolean} => {
    const present = parts.filter((part): part is string => Boolean(part))
    const and = present.filter(part => !part.includes('|'))
    const or = present.filter(part => part.includes('|'))
    if (!and.length) return {value: or[0], exact: or.length <= 1}
    return {value: [...new Set(and.join(',').split(','))].join(','), exact: !or.length}
}

/** Discover у фильмов не отдаёт страну: при with_origin_country её знаем из запроса. */
const withOrigin = (item: Raw, shelf: Shelf): Raw =>
    shelf.originCountry && !(item.origin_country ?? []).length ? {...item, origin_country: [shelf.originCountry]} : item

const verdictKey = (mediaType: string, id: number) => `${mediaType}:${id}`

/** Вердикты судьи по связке (текущая версия рубрики). Хранилище недоступно — пусто. */
export const bundleVerdicts = async (bundle: Bundle): Promise<Map<string, VerdictRow>> => {
    try {
        const store = await getBundleStore()
        const rows = await store.verdicts(bundle.key, rubricOf(bundle).version)
        return new Map(rows.map(row => [verdictKey(row.media_type, Number(row.media_id)), row]))
    } catch (error) {
        console.warn('[COLLECTIONS] Bundle verdicts unavailable', bundle.key, error instanceof Error ? error.message : error)
        return new Map()
    }
}

/**
 * Кандидаты судимой связки: только тайтлы с вердиктом «да» (их снимок хранится с вердиктом —
 * discover не нужен), отбор по полке и периоду раздела.
 */
const judgedCandidates = async (bundle: Bundle, shelf: Shelf, section: Section, window: Window, excludeIds: number[]): Promise<Candidate[]> => {
    const verdicts = await bundleVerdicts(bundle)
    const skip = new Set(excludeIds)
    const items = [...verdicts.values()]
        .filter(row => row.verdict === 'yes' && row.media_type === shelf.mediaType && !skip.has(Number(row.media_id)))
        .map((row): Candidate => {
            const snap = row.snapshot
            const item: Raw = {
                id: Number(row.media_id),
                [shelf.mediaType === 'movie' ? 'title' : 'name']: snap.title,
                [shelf.mediaType === 'movie' ? 'release_date' : 'first_air_date']: snap.date ?? '',
                vote_average: snap.voteAverage,
                vote_count: snap.voteCount,
                popularity: snap.popularity,
                genre_ids: snap.genreIds ?? [],
                origin_country: snap.originCountry ?? [],
                original_language: snap.originalLanguage ?? ''
            }
            return {item, judgeScore: Number(row.score) || 0}
        })
        .filter(({item}) => hasRussianTitle(String(item.title || item.name || '')) && !isExcludedOrigin(item) && fitsShelf(item, shelf))

    if (shelf.mediaType === 'movie') return items.filter(({item}) => inWindow(item.release_date, window))
    const withDetails = await mapLimit(items, 8, async (candidate): Promise<Candidate | null> => {
        try {
            const details = await tvDetails(Number(candidate.item.id))
            return tvFitsSection(section, details, window) ? {...candidate, details} : null
        } catch {
            return null
        }
    })
    return withDetails.filter((entry): entry is Candidate => Boolean(entry))
}

/**
 * Кандидаты раздела за период с фильтрами (без проверки трейлеров): discover до 100 штук на
 * набор условий → русское название → у сериалов карточка и условие раздела.
 * capped — в TMDB больше, чем мы смотрим (для счётчика «100+»).
 */
export const collectCandidates = async (
    params: CollectionParams,
    excludeIds: number[] = [],
    /** Для судьи: кандидаты по правилам связки без учёта вердиктов (и у судимых — через discover). */
    {ignoreVerdicts = false}: {ignoreVerdicts?: boolean} = {}
): Promise<{candidates: Candidate[], capped: boolean}> => {
    const section = SECTIONS[params.section]
    const scope = collectionWindow(params)
    if (!section || !scope) return {candidates: [], capped: false}
    const {window, direction} = scope
    const shelf = shelfForParams(params)
    const bundle = bundleForParams(params)
    if (bundle?.kind === 'judged' && !ignoreVerdicts) {
        return {candidates: await judgedCandidates(bundle, shelf, section, window, excludeIds), capped: false}
    }
    const rules = bundle ? bundleQuery(bundle, shelf) : undefined

    const base = sectionQuery(section, window, params, shelf, rules?.withoutGenres)
    const seen = new Set<number>(excludeIds)
    const raw: Raw[] = []
    let capped = false
    const match = params.match ?? 'and'
    const filter = resolveFilter(params)
    const {params: filterParams, exact: filterExact} = filterQuery(filter, match)
    const genres = mergeGenres([shelfQuery(shelf).with_genres, filterParams.with_genres, rules?.params.with_genres])
    const exact = filterExact && genres.exact
    const filterUsesKeywords = [...filter.genres, ...filter.tags].some(concept => concept.keywords.length)

    {
        const query = new URLSearchParams({
            ...base,
            ...filterParams,
            ...(rules?.params ?? {})
        })
        if (genres.value) query.set('with_genres', genres.value)
        else query.delete('with_genres')
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
    const titled = raw.map(item => withOrigin(item, shelf)).filter(item =>
        hasRussianTitle(String(item.title || item.name || '')) &&
        !isExcludedOrigin(item) &&
        fitsShelf(item, shelf) &&
        (direction === 'released' || Number(item.popularity) >= minPopularity))

    const genreIdsOf = (item: Raw): number[] => (item.genre_ids ?? []).map(Number)

    // Судья уже сказал «нет» — тайтл в автоматическую связку не идёт (шум ключевых слов).
    const verdicts = bundle && !ignoreVerdicts ? await bundleVerdicts(bundle) : undefined
    const rejected = (item: Raw) => verdicts?.get(verdictKey(section.mediaType, Number(item.id)))?.verdict === 'no'

    if (section.mediaType === 'movie') {
        if (exact && !bundle) return {candidates: titled.map(item => ({item})), capped}
        // Выборка шире правила (несколько тегов-понятий, правила связки) — проверка по ключевым словам фильма.
        const fetchKeywords = Boolean(rules?.needsKeywords) || (!exact && filterUsesKeywords)
        const checked = await mapLimit(titled, 8, async (item): Promise<Candidate | null> => {
            try {
                if (rejected(item)) return null
                const keywords = fetchKeywords ? await movieKeywords(Number(item.id)) : null
                if (!exact && !matchesFilter(filter, match, genreIdsOf(item), keywords ?? [])) return null
                if (bundle && !bundleMatches(bundle, shelf, item, keywords)) return null
                return {item, keywords}
            } catch (error) {
                console.warn('[COLLECTIONS] Movie keywords failed', item.id, error instanceof Error ? error.message : error)
                return null
            }
        })
        return {candidates: checked.filter((entry): entry is Candidate => Boolean(entry)), capped}
    }

    // Одна неудачная карточка не должна ронять всю подборку: такой сериал просто пропускаем.
    const withDetails = await mapLimit(titled.filter(item => !rejected(item)), 8, async item => {
        try {
            const details = await tvDetails(Number(item.id))
            const keywords = keywordIdsOf(details)
            if (!exact && !matchesFilter(filter, match, genreIdsOf(item), keywords)) return null
            if (bundle && !bundleMatches(bundle, shelf, item, keywords, details)) return null
            return {item, details, keywords}
        } catch (error) {
            console.warn('[COLLECTIONS] TV details failed', item.id, error instanceof Error ? error.message : error)
            return null
        }
    })
    return {
        candidates: withDetails.filter((entry): entry is {item: Raw, details: Raw, keywords: number[]} =>
            Boolean(entry) && tvFitsSection(section, entry!.details, window)),
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

    const shelf = shelfForParams(params)
    const bundle = bundleForParams(params)
    const {candidates} = await collectCandidates(params, excludeIds)
    const maxLogVotes = Math.max(1e-9, ...candidates.map(c => Math.log1p(Number(c.item.vote_count) || 0)))
    const maxLogPopularity = Math.max(1e-9, ...candidates.map(c => Math.log1p(Number(c.item.popularity) || 0)))
    const mean = meanRating(candidates.map(c => c.item))
    const scoreOf = (candidate: Candidate) => bundle
        // У судимых — плюс уверенность судьи (баллы рубрики из 6).
        ? bundleScore(bundle, shelf, candidate.item, candidate.keywords ?? null, {mean, maxLogPopularity}) + 0.15 * (candidate.judgeScore ?? 0) / 6
        : rankScore(candidate, scope.direction, maxLogVotes, maxLogPopularity)
    const scored = candidates
        .map(candidate => ({candidate, score: scoreOf(candidate)}))
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
                contentType: shelf.contentType,
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
    const canUseOr = params.criterion === 'filter' && canRelaxFilter(params)
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

/** Сколько трейлеров проверяем для счётчика (дальше — «N+»). */
const COUNT_TRAILER_LIMIT = 40

/** Сколько кандидатов с трейлером (у сериалов видео уже в карточке, у фильмов — кэш media_trailers). */
const countWithTrailers = async (mediaType: 'movie' | 'tv', candidates: Candidate[]) => {
    const checked = candidates.slice(0, COUNT_TRAILER_LIMIT)
    if (mediaType === 'tv') {
        const withTrailer = checked.filter(c => pickTrailer(c.details?.videos?.results ?? [])).length
        return {count: withTrailer, more: candidates.length > checked.length}
    }
    const trailers = await findTrailers('movie', checked.map(c => Number(c.item.id)))
    const withTrailer = checked.filter(c => trailers.get(Number(c.item.id))).length
    return {count: withTrailer, more: candidates.length > checked.length}
}

/**
 * Сколько тайтлов с трейлером найдено за период (кнопки «До конца года (5)») — столько же покажет топ.
 * Без картинок и карточек. С несколькими условиями — как в топе: «И», если его мало — плюс «ИЛИ».
 * capped — проверили не всё (кнопка покажет «40+»).
 */
export const countCollection = async (params: CollectionParams): Promise<{count: number, capped: boolean}> => {
    const section = SECTIONS[params.section]
    if (!section) return {count: 0, capped: false}
    const and = await collectCandidates({...params, match: 'and'})
    const andCount = await countWithTrailers(section.mediaType, and.candidates)
    const canUseOr = params.criterion === 'filter' && canRelaxFilter(params)
    if (and.capped || andCount.more || andCount.count >= COLLECTION_SIZE || !canUseOr) {
        return {count: andCount.count, capped: and.capped || andCount.more}
    }
    const or = await collectCandidates({...params, match: 'or'}, and.candidates.map(c => Number(c.item.id)))
    const orCount = await countWithTrailers(section.mediaType, or.candidates)
    return {count: andCount.count + orCount.count, capped: or.capped || orCount.more}
}

/**
 * Связки для экрана «🧩 Связки»: автоматические — все применимые на полке в разделе; судимые —
 * только если у судьи уже набралось «да» на подборку (minResults), иначе связка скрыта.
 */
export const availableBundles = async (shelfKey: ShelfKey, section: SectionKey): Promise<Bundle[]> => {
    // Последний расчёт провалил контрольные тайтлы — судимую связку не показываем.
    const blocked = async (bundle: Bundle) => {
        try {
            const last = (await (await getBundleStore()).runs(bundle.key)).find(run => run.status === 'done')
            return last?.stats?.publishable === false
        } catch {
            return false
        }
    }
    const shelf = SHELVES[shelfKey]
    const fitting = bundlesFor(shelfKey, section)
    const judged = await mapLimit(fitting.filter(bundle => bundle.kind === 'judged'), 3, async bundle => {
        const verdicts = await bundleVerdicts(bundle)
        const yes = [...verdicts.values()].filter(row =>
            row.verdict === 'yes' && row.media_type === shelf.mediaType && (!row.snapshot?.shelf || row.snapshot.shelf === shelfKey))
        return yes.length >= bundle.minResults && !(await blocked(bundle)) ? bundle.key : null
    })
    const ready = new Set(judged.filter(Boolean))
    return fitting.filter(bundle => bundle.kind === 'auto' || ready.has(bundle.key))
}
