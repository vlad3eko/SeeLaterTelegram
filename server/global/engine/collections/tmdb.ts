import {createMemo} from '#server/global/engine/collections/memo'

/**
 * Запрос к TMDB API v3 (Bearer TMDB_API_KEY) с повтором при 429 и кэшем в памяти.
 * Выдачи (discover, trending, search) меняются в течение дня — 30 минут; карточки тайтлов
 * и людей, ключевые слова, видео, рекомендации почти не меняются — 6 часов. Одинаковые запросы,
 * пришедшие одновременно (счётчики периодов параллельно со сборкой), идут в TMDB один раз.
 */

const LIST_TTL_MS = 30 * 60_000
const CARD_TTL_MS = 6 * 60 * 60_000
const CACHE_MAX_ENTRIES = 3000

const memo = createMemo<unknown>({maxEntries: CACHE_MAX_ENTRIES})

/** Срок кэша по адресу: выдачи — 30 минут, остальное — 6 часов. */
export const tmdbTtl = (pathAndQuery: string) =>
    /^(discover|trending|search)\//.test(pathAndQuery) ? LIST_TTL_MS : CARD_TTL_MS

const fetchTmdb = async (pathAndQuery: string): Promise<unknown> => {
    const apiKey = process.env.TMDB_API_KEY?.trim()
    if (!apiKey) throw new Error('[COLLECTIONS] TMDB_API_KEY is missing')

    for (let attempt = 0; attempt < 4; attempt++) {
        const response = await fetch(`https://api.themoviedb.org/3/${pathAndQuery}`, {
            headers: {accept: 'application/json', Authorization: `Bearer ${apiKey}`},
            signal: AbortSignal.timeout(20_000)
        })
        if (response.status === 429) {
            await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)))
            continue
        }
        if (!response.ok) throw new Error(`[COLLECTIONS] TMDB ${response.status}: ${pathAndQuery.split('?')[0]}`)
        return response.json()
    }
    throw new Error(`[COLLECTIONS] TMDB 429: ${pathAndQuery.split('?')[0]}`)
}

export const tmdbGet = async <T = Record<string, any>>(pathAndQuery: string): Promise<T> =>
    await memo.get(pathAndQuery, tmdbTtl(pathAndQuery), () => fetchTmdb(pathAndQuery)) as T

/** Параллельно, но не больше limit запросов одновременно. */
export const mapLimit = async <T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> => {
    const results = new Array<R>(items.length)
    let next = 0
    const worker = async () => {
        while (next < items.length) {
            const index = next++
            results[index] = await fn(items[index]!)
        }
    }
    await Promise.all(Array.from({length: Math.min(limit, items.length)}, worker))
    return results
}
