
import {buildCacheKey, getCache, saveCache} from "#server/global/engine/search/repository/cacheRepository";

export default defineEventHandler(async (event) => {
    const query = getQuery(event)
    const config = useRuntimeConfig()
    const headers = {
        accept: "application/json",
        Authorization: `Bearer ${config.tmdbApiKey}`
    }

    const media = query.media === "tv" ? "tv" : "movie"
    // page подставляется в адрес запроса к TMDB, поэтому приводим его к числу (у TMDB максимум 500).
    const page = Math.min(500, Math.max(1, parseInt(String(query.page)) || 1))
    const endpoint = 'popular'
    const TTL_TWO_HOURS = 2 / 24

    const cacheKey = buildCacheKey(endpoint, {
        media,
        page
    })
    const cache = await getCache(event, cacheKey)
    if (cache) return cache

    const tmdbStart =
        performance.now()

    const res = await fetch(
        `https://api.themoviedb.org/3/${media}/popular?language=ru-RU&page=${page}`,
        {
            headers
        })

    if (!res.ok) {
        throw createError({
            status: res.status,
            message: await res.text()
        })
    }


    const response = await res.json()

    await saveCache(event, endpoint, cacheKey, response, TTL_TWO_HOURS)

    console.log(
        `[TMDB] POPULAR ${(performance.now()-tmdbStart).toFixed(2)}ms`
    )

    return response
})
