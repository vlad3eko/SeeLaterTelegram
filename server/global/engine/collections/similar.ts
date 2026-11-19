import {hasRussianTitle} from '#server/global/engine/collections/buildCollection'
import {isExcludedOrigin} from '#server/global/engine/collections/catalog'
import {fitsShelf, type MediaType, type Shelf, shelfOf, SHELVES} from '#server/global/engine/collections/shelves'
import {mapLimit, tmdbGet} from '#server/global/engine/collections/tmdb'
import {findTrailers, type Trailer} from '#server/global/engine/collections/trailers'

/**
 * «🔗 Похожее» (ТЗ, пункт 4): тайтлы, похожие на открытый в подборке.
 *
 * Кандидаты — recommendations (2 страницы, поведение зрителей) и similar (1 страница, жанры и
 * слова), объединённые по позициям (Reciprocal Rank Fusion: 1 / (60 + место) из каждого списка).
 * Та же полка (аниме к аниме), без своей франшизы (у фильмов — коллекция TMDB), не меньше
 * порога голосов. Порядок — RRF + общие ключевые слова (×2) + общие жанры.
 *
 * Свежесть (решение владельца 19.11.2026): похожие не старше тайтла больше чем на 10 лет —
 * к «Обители зла» 2026 года не «Рассвет мертвецов» 1978-го. Новее — можно (к фильму 1985 года
 * подойдёт и свежий). Если в окне меньше двух десятков кандидатов, сначала добор из discover
 * (общие ключевые слова, основной жанр, не старше окна), затем окно расширяется до 15 и 20 лет.
 */

type Raw = Record<string, any>

export type SimilarItem = {
    mediaType: MediaType
    id: number
    title: string
    year?: number
    voteAverage: number
    voteCount: number
    popularity: number
    score: number
    trailer: Trailer
}

const RRF_K = 60
/** Голосов не меньше доли порога «известного» на полке. */
const VOTES_SHARE = 0.1
/** Окна свежести в годах: основное и запасные, если в основном мало кандидатов. */
export const YEAR_WINDOWS = [10, 15, 20]
/** Сколько кандидатов нужно в окне, чтобы не расширять его (часть отсеется без трейлера). */
const WINDOW_MIN_POOL = 20

export const yearOf = (item: Raw): number | undefined => {
    const year = Number(String(item.release_date || item.first_air_date || '').slice(0, 4))
    return year > 1800 ? year : undefined
}

/**
 * Кандидаты не старше тайтла больше чем на окно лет (новее — можно). Без года у тайтла — без
 * фильтра; кандидат без даты отсеивается. Окно расширяется, пока кандидатов меньше minPool.
 */
export const freshPool = <T>(pool: T[], itemOf: (entry: T) => Raw, baseYear: number | undefined, minPool = WINDOW_MIN_POOL): T[] => {
    if (!baseYear) return pool
    let fresh: T[] = []
    for (const window of YEAR_WINDOWS) {
        fresh = pool.filter(entry => (yearOf(itemOf(entry)) ?? 0) >= baseYear - window)
        if (fresh.length >= minPool) break
    }
    return fresh
}

const keywordIdsOf = (body: Raw | undefined): number[] =>
    ((body?.keywords ?? body?.results ?? []) as Raw[]).map(keyword => Number(keyword.id))

/** RRF: тайтл выше в обоих списках — выше в общем. */
export const fuseRanks = (lists: Raw[][], weights: number[] = []): Map<number, {item: Raw, rrf: number}> => {
    const fused = new Map<number, {item: Raw, rrf: number}>()
    lists.forEach((list, listIndex) => {
        list.forEach((item, index) => {
            const id = Number(item.id)
            const entry = fused.get(id) ?? {item, rrf: 0}
            entry.rrf += (weights[listIndex] ?? 1) / (RRF_K + index + 1)
            fused.set(id, entry)
        })
    })
    return fused
}

/**
 * Итоговая оценка: RRF (нормированная) + доля общих слов ×2 + доля общих жанров + известность ×0.5.
 * Известность — потому что recommendations TMDB местами случайны (живая проверка 19.11 на
 * «Острове проклятых»: «Страна Небывалия» на 3-м месте), а известный тайтл чаще действительно похож.
 */
export const similarScore = (rrf: number, maxRrf: number, sharedKeywords: number, baseKeywords: number, sharedGenres: number, baseGenres: number, votesNorm = 0) =>
    rrf / Math.max(maxRrf, 1e-9) + 0.5 * votesNorm +
    2 * (baseKeywords ? sharedKeywords / baseKeywords : 0) +
    (baseGenres ? sharedGenres / baseGenres : 0)

export const buildSimilar = async (
    base: {mediaType: MediaType, id: number},
    shelf: Shelf,
    {size = 10}: {size?: number} = {}
): Promise<{items: SimilarItem[], rest: Array<{id: number, score: number}>, title: string}> => {
    const kind = base.mediaType
    const details = await tmdbGet<Raw>(`${kind}/${base.id}?language=ru-RU&append_to_response=keywords`)
    const title = String(details.title || details.name || '')
    const baseKeywords = new Set(keywordIdsOf(details.keywords))
    const baseGenres = new Set(((details.genres ?? []) as Raw[]).map(genre => Number(genre.id)))
    const collectionId = details.belongs_to_collection?.id ? Number(details.belongs_to_collection.id) : undefined

    const page = (path: string, n: number) =>
        tmdbGet<{results?: Raw[]}>(`${kind}/${base.id}/${path}?language=ru-RU&page=${n}`).then(body => body.results ?? []).catch(() => [])
    const [rec1, rec2, sim1] = await Promise.all([page('recommendations', 1), page('recommendations', 2), page('similar', 1)])
    const lists: Raw[][] = [[...rec1, ...rec2], sim1]
    // similar шумнее (жанры и слова без поведения зрителей) — вес вдвое меньше.
    const weights = [1, 0.5]

    const minVotes = Math.round(shelf.knownVotes * VOTES_SHARE)
    const shelfPoolOf = () => {
        const fused = fuseRanks(lists, weights)
        fused.delete(base.id)
        return [...fused.values()].filter(({item}) =>
            hasRussianTitle(String(item.title || item.name || '')) &&
            !isExcludedOrigin(item) &&
            // recommendations у фильмов без страны: язык решает (японская анимация — аниме).
            fitsShelf(item, shelf) &&
            (Number(item.vote_count) || 0) >= minVotes)
    }
    const baseYear = yearOf(details)
    let shelfPool = shelfPoolOf()

    // Свежих кандидатов мало (recommendations у новинок тянут классику) — добор из discover:
    // те же ключевые слова (любое), основной жанр, не старше окна, самые обсуждаемые. Один запрос.
    const freshCount = baseYear ? shelfPool.filter(({item}) => (yearOf(item) ?? 0) >= baseYear - YEAR_WINDOWS[0]!).length : Infinity
    const mainGenre = ((details.genres ?? []) as Raw[])[0]?.id
    if (baseYear && freshCount < WINDOW_MIN_POOL && baseKeywords.size && mainGenre) {
        const dateField = kind === 'movie' ? 'primary_release_date' : 'first_air_date'
        const discovered = await tmdbGet<{results?: Raw[]}>(
            `discover/${kind}?language=ru-RU&with_keywords=${[...baseKeywords].join('|')}&with_genres=${mainGenre}` +
            `&${dateField}.gte=${baseYear - YEAR_WINDOWS[0]!}-01-01&sort_by=vote_count.desc&vote_count.gte=${minVotes}`
        ).then(body => body.results ?? []).catch(() => [])
        lists.push(discovered)
        weights.push(0.5)
        shelfPool = shelfPoolOf()
    }
    const pool = freshPool(shelfPool, entry => entry.item, baseYear)

    // Ключевые слова и франшиза кандидатов: у фильмов — коллекция TMDB (свою франшизу не показываем).
    const enriched = await mapLimit(pool, 8, async ({item, rrf}) => {
        try {
            const card = await tmdbGet<Raw>(`${kind}/${item.id}?language=ru-RU&append_to_response=keywords`)
            if (collectionId && Number(card.belongs_to_collection?.id) === collectionId) return null
            return {item, rrf, keywords: keywordIdsOf(card.keywords)}
        } catch {
            return {item, rrf, keywords: [] as number[]}
        }
    })

    const maxRrf = Math.max(0, ...pool.map(entry => entry.rrf))
    const maxLogVotes = Math.max(1e-9, ...pool.map(entry => Math.log1p(Number(entry.item.vote_count) || 0)))
    const scored = enriched
        .filter((entry): entry is {item: Raw, rrf: number, keywords: number[]} => Boolean(entry))
        .map(entry => {
            const sharedKeywords = entry.keywords.filter(id => baseKeywords.has(id)).length
            const sharedGenres = ((entry.item.genre_ids ?? []) as number[]).filter(id => baseGenres.has(Number(id))).length
            return {
                item: entry.item,
                score: similarScore(entry.rrf, maxRrf, sharedKeywords, baseKeywords.size, sharedGenres, baseGenres.size,
                    Math.log1p(Number(entry.item.vote_count) || 0) / maxLogVotes)
            }
        })
        .sort((a, b) => b.score - a.score)

    const items: SimilarItem[] = []
    let cursor = 0
    while (items.length < size && cursor < scored.length) {
        const batch = scored.slice(cursor, cursor + 6)
        const trailers = await findTrailers(kind, batch.map(entry => Number(entry.item.id)))
        for (const {item, score} of batch) {
            if (items.length >= size) break
            // Непросмотренный хвост пачки остаётся на «Ещё вариант».
            cursor++
            const trailer = trailers.get(Number(item.id))
            if (!trailer) continue
            const date = String(item.release_date || item.first_air_date || '')
            items.push({
                mediaType: kind,
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
    const rest = scored.slice(cursor).filter(entry => !used.has(Number(entry.item.id)))
        .map(entry => ({id: Number(entry.item.id), score: entry.score}))
    return {items, rest, title}
}

/**
 * «🔗 Похожее» на обычной карточке (вне /g): полку определяет сам тайтл — жанры и страна из TMDB
 * (аниме к аниме, мультфильм к мультфильмам). Карточка тайтла берётся тем же запросом, что
 * и в buildSimilar, поэтому второй раз из кэша, а не из TMDB.
 */
export const buildSimilarFor = async (base: {mediaType: MediaType, id: number}, options: {size?: number} = {}) => {
    const details = await tmdbGet<Raw>(`${base.mediaType}/${base.id}?language=ru-RU&append_to_response=keywords`)
    const shelf = SHELVES[shelfOf(details, base.mediaType)]
    return {shelf, ...await buildSimilar(base, shelf, options)}
}
