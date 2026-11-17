/** Запрос к TMDB API v3 (Bearer TMDB_API_KEY) с повтором при 429. */
export const tmdbGet = async <T = Record<string, any>>(pathAndQuery: string): Promise<T> => {
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
        return await response.json() as T
    }
    throw new Error(`[COLLECTIONS] TMDB 429: ${pathAndQuery.split('?')[0]}`)
}
