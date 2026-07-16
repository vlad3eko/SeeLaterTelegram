import {buildCacheKey, getCache, saveCache} from "~/utils/search/repository/cacheRepository";

export default defineEventHandler(async (event) => {
    const query = getQuery(event)
    const config = useRuntimeConfig()
    const headers = {
        accept: 'application/json',
        Authorization: `Bearer ${config.tmdbApiKey}`
    }

    const endpoint = 'genres'

    const cacheKey = buildCacheKey(endpoint, {
        media: query.media
    })

    const cache = await getCache(event, cacheKey)
    if (cache) return cache

    const tmdbStart =
        performance.now()

    const genres = await fetch(
        `https://api.themoviedb.org/3/genre/${query.media}/list?language=ru-RU`,
        {
            headers
        }
    )

    if (!genres.ok) {
        throw createError({
            statusCode: genres.status,
            statusMessage: await genres.text()
        })
    }

    await saveCache(event, endpoint, cacheKey, genres, 365)

    console.log(
        `[TMDB] GENRES ${(performance.now()-tmdbStart).toFixed(2)}ms`
    )

    return genres
})
