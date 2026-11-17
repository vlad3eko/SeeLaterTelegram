/**
 * Запрос к TMDB API v3 (Bearer TMDB_API_KEY) с повтором при 429 и кэшем в памяти на 30 минут:
 * счётчики на экране периода и сборка топа ходят за одними и теми же страницами discover и
 * карточками сериалов — второй раз это уже из памяти.
 */

const CACHE_TTL_MS = 30 * 60_000
const CACHE_MAX_ENTRIES = 3000

const cache = new Map<string, {at: number, data: unknown}>()

export const tmdbGet = async <T = Record<string, any>>(pathAndQuery: string): Promise<T> => {
    const cached = cache.get(pathAndQuery)
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.data as T

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
        const data = await response.json() as T

        if (cache.size >= CACHE_MAX_ENTRIES) cache.delete(cache.keys().next().value!)
        cache.set(pathAndQuery, {at: Date.now(), data})
        return data
    }
    throw new Error(`[COLLECTIONS] TMDB 429: ${pathAndQuery.split('?')[0]}`)
}

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
