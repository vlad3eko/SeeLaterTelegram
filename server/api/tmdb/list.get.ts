
import {buildCacheKey, getCache, saveCache} from "#server/global/engine/search/repository/cacheRepository";
import {buildSimilarContent} from "#server/global/engine/collections/similarContent";
import {tmdbGet as tmdbCachedGet} from "#server/global/engine/collections/tmdb";

/*
 * Подборки TMDB для сайта: полки главной и блоки «Рекомендации» / «Похожие» на странице тайтла.
 * kind — только из списка ниже (попадает в путь запроса к TMDB). Ответ — как у search:
 * { results (с media_type), page, total_pages }.
 */
const KINDS = {
    trending: {ttl: 2 / 24, needsId: false},
    now_playing: {ttl: 6 / 24, needsId: false},
    upcoming: {ttl: 6 / 24, needsId: false},
    on_the_air: {ttl: 6 / 24, needsId: false},
    top_rated: {ttl: 1, needsId: false},
    recommendations: {ttl: 3, needsId: true},
    similar: {ttl: 3, needsId: true},
    // Франшиза: id — belongs_to_collection.id фильма. В TMDB коллекции есть только у фильмов.
    collection: {ttl: 3, needsId: true},
} as const

type Kind = keyof typeof KINDS
type ListMedia = 'movie' | 'tv' | 'all'

export default defineEventHandler(async (event) => {

    const query = getQuery(event)
    const config = useRuntimeConfig()

    const kind = String(query.kind || '') as Kind
    const media = query.media === 'tv' ? 'tv' : query.media === 'movie' ? 'movie' : query.media === 'all' ? 'all' : null
    const id = Number(query.id || 0)
    const page = Math.min(500, Math.max(1, parseInt(String(query.page)) || 1))

    if (!(kind in KINDS) || !media) {
        throw createError({status: 400, message: 'Invalid list'})
    }

    const options = KINDS[kind]

    if (options.needsId && (!Number.isSafeInteger(id) || id <= 0)) {
        throw createError({status: 400, message: 'Invalid id'})
    }

    // all допустим только для trending; now_playing/upcoming — только фильмы, on_the_air — только сериалы.
    if (media === 'all' && kind !== 'trending') throw createError({status: 400, message: 'Invalid media'})
    if ((kind === 'now_playing' || kind === 'upcoming') && media !== 'movie') throw createError({status: 400, message: 'Invalid media'})
    if (kind === 'on_the_air' && media !== 'tv') throw createError({status: 400, message: 'Invalid media'})
    if (kind === 'collection' && media !== 'movie') throw createError({status: 400, message: 'Invalid media'})
    if (kind === 'similar' && media === 'all') throw createError({status: 400, message: 'Invalid media'})

    return loadList(event, kind, media, id, page)
})

/*
 * Подборка с кэшем (Supabase tmdb_cache). Вынесена из обработчика, чтобы «Похожие» брали
 * «Рекомендации» и «Франшизу» из того же кэша, что и сами блоки, — и исключали ровно показанное.
 */
async function loadList(event: any, kind: Kind, media: ListMedia, id: number, page: number): Promise<{results?: any[], [key: string]: any}> {
    const options = KINDS[kind]
    const config = useRuntimeConfig()

    const endpoint = `list/${kind}`
    // v2: upcoming без повторных прокатов; v4 (только collection): родственные коллекции франшизы;
    // v5 (только similar): свой подбор по содержанию вместо сырого TMDB /similar;
    // v3 (только recommendations): без частей франшизы
    const version = kind === 'collection' ? 4 : kind === 'similar' ? 5 : kind === 'recommendations' ? 3 : 2
    const cacheKey = buildCacheKey(endpoint, {media, id: options.needsId ? id : undefined, page, v: version})

    const cache = await getCache(event, cacheKey)
    if (cache) return cache as {results?: any[], [key: string]: any}

    if (kind === 'similar') {
        return buildSimilarList(event, media === 'tv' ? 'tv' : 'movie', id, endpoint, cacheKey)
    }

    const params = new URLSearchParams({language: 'ru-RU', page: String(page)})
    if (kind === 'now_playing' || kind === 'upcoming') params.append('region', 'RU')

    const path =
        kind === 'trending' ? `trending/${media}/week`
            : kind === 'collection' ? `collection/${id}`
            : options.needsId ? `${media}/${id}/${kind}`
                : `${media}/${kind}`

    const tmdbStart = performance.now()

    const res = await fetch(`https://api.themoviedb.org/3/${path}?${params}`, {
        headers: {
            accept: 'application/json',
            Authorization: `Bearer ${config.tmdbApiKey}`
        }
    })

    if (!res.ok) {
        throw createError({status: res.status, message: await res.text()})
    }

    const data = await res.json()

    // TMDB дробит франшизу на коллекции («The Hunger Games Collection» и «… Prequel Collection»):
    // добавляем части родственных коллекций, чтобы блок «Франшиза» показывал всю серию.
    if (kind === 'collection' && Array.isArray(data.parts)) {
        const extra = await relatedCollectionParts(id, config.tmdbApiKey).catch((error) => {
            console.error('[TMDB] COLLECTION RELATED ERROR', error)
            return []
        })
        const seen = new Set(data.parts.map((item: any) => item.id))
        for (const item of extra) {
            if (!seen.has(item.id)) {
                seen.add(item.id)
                data.parts.push(item)
            }
        }
    }

    const today = new Date().toISOString().slice(0, 10)

    // Коллекция отдаёт части фильма в parts, остальные подборки — в results.
    const source = kind === 'collection' ? data.parts : data.results

    let results = (Array.isArray(source) ? source : [])
        .map((item: any) => ({...item, media_type: item.media_type || media}))
        // trending/all отдаёт и людей — на полках тайтлов они не нужны.
        .filter((item: any) => item.media_type === 'movie' || item.media_type === 'tv')
        // upcoming в регионе RU включает повторные прокаты старых фильмов — оставляем только будущие премьеры.
        .filter((item: any) => kind !== 'upcoming' || String(item.release_date || '') >= today)

    // Франшиза: сначала невышедшие (ближайшая премьера первой), затем вышедшие от новых к старым.
    if (kind === 'collection') {
        const isUpcoming = (item: any) => !item.release_date || item.release_date > today
        results = results.sort((a: any, b: any) => {
            const ua = isUpcoming(a), ub = isUpcoming(b)
            if (ua !== ub) return ua ? -1 : 1
            const da = a.release_date || '9999', db = b.release_date || '9999'
            return ua ? da.localeCompare(db) : db.localeCompare(da)
        })
    }

    // «Рекомендуем посмотреть» без частей франшизы — они показаны в своём блоке выше.
    if (kind === 'recommendations' && media === 'movie') {
        const franchise = await franchiseIds(event, id)
        if (franchise.size) results = results.filter((item: any) => !franchise.has(Number(item.id)))
    }

    const response = {
        page: data.page || page,
        ...(kind === 'collection' ? {name: data.name || ''} : {}),
        total_pages: data.total_pages || 1,
        total_results: data.total_results || results.length,
        results
    }

    await saveCache(event, endpoint, cacheKey, response, options.ttl)

    console.log(`[TMDB] LIST ${kind} ${(performance.now() - tmdbStart).toFixed(2)}ms`, {media, id: options.needsId ? id : undefined, page})

    return response
}

/*
 * «Похожие» (одна страница): похожие по содержанию без тех, что уже показаны в «Рекомендуем
 * посмотреть» и во «Франшизе». Сколько прошло фильтры — столько и отдаём.
 */
/** id фильмов блока «Франшиза» этого фильма (тот же кэш, что у самого блока); пусто — франшизы нет. */
async function franchiseIds(event: any, movieId: number): Promise<Set<number>> {
    try {
        const details = await tmdbCachedGet<Record<string, any>>(`movie/${movieId}?language=ru-RU&append_to_response=keywords`)
        const collectionId = Number(details?.belongs_to_collection?.id) || 0
        if (!collectionId) return new Set()
        const collection = await loadList(event, 'collection', 'movie', collectionId, 1)
        return new Set((collection?.results ?? []).map((item: any) => Number(item.id)))
    } catch (error) {
        console.error('[TMDB] FRANCHISE IDS ERROR', error)
        return new Set()
    }
}

async function buildSimilarList(event: any, media: 'movie' | 'tv', id: number, endpoint: string, cacheKey: string) {
    const start = performance.now()
    const exclude = new Set<number>([id])

    const [recommendations, franchise] = await Promise.all([
        loadList(event, 'recommendations', media, id, 1).catch(() => null),
        media === 'movie' ? franchiseIds(event, id) : new Set<number>(),
    ])
    for (const item of recommendations?.results ?? []) exclude.add(Number(item.id))
    for (const franchiseId of franchise) exclude.add(franchiseId)

    const results = await buildSimilarContent(event, {mediaType: media, id}, exclude)
    const response = {page: 1, total_pages: 1, total_results: results.length, results}

    await saveCache(event, endpoint, cacheKey, response, KINDS.similar.ttl)
    console.log(`[TMDB] LIST similar ${(performance.now() - start).toFixed(2)}ms`, {media, id, results: results.length})

    return response
}

const tmdbGet = async (path: string, apiKey: string) => {
    const res = await fetch(`https://api.themoviedb.org/3/${path}`, {
        headers: {accept: 'application/json', Authorization: `Bearer ${apiKey}`}
    })
    if (!res.ok) throw new Error(`TMDB ${res.status} ${path}`)
    return res.json()
}

// Хвост английского имени родственной коллекции после общей основы: «Collection», «Prequel Collection» и т. п.
const RELATED_SUFFIX = /^(\s+(prequel|prequels|sequel|sequels|spin-?off|spin-?offs|anthology|origins?|legacy|reboot))*\s+collection$/i

/*
 * Части коллекций той же франшизы. Основа — английское имя коллекции без «Collection»
 * («The Hunger Games»); родственные — коллекции из поиска, чьё имя = основа + RELATED_SUFFIX.
 */
async function relatedCollectionParts(collectionId: number, apiKey: string): Promise<any[]> {
    const own = await tmdbGet(`collection/${collectionId}?language=en-US`, apiKey)
    const base = String(own?.name || '').replace(/\s*collection$/i, '').trim()
    if (base.length < 3) return []

    const found = await tmdbGet(`search/collection?${new URLSearchParams({query: base, language: 'en-US'})}`, apiKey)
    const baseLower = base.toLowerCase()
    const relatedIds = (Array.isArray(found?.results) ? found.results : [])
        .filter((item: any) => item.id !== collectionId)
        .filter((item: any) => {
            const name = String(item.original_name || item.name || '')
            return name.toLowerCase().startsWith(baseLower) && RELATED_SUFFIX.test(name.slice(base.length))
        })
        .slice(0, 3)
        .map((item: any) => item.id)

    const collections = await Promise.all(relatedIds.map((relatedId: number) =>
        tmdbGet(`collection/${relatedId}?language=ru-RU`, apiKey).catch(() => null)))

    return collections.flatMap((collection: any) => Array.isArray(collection?.parts) ? collection.parts : [])
}
