import {buildCacheKey, getCache, saveCache} from "#server/global/engine/search/repository/cacheRepository";

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

    const response = await $fetch(
        `https://api.themoviedb.org/3/genre/${query.media}/list?language=ru-RU`,
        {
            headers
        }
    )

    await saveCache(
        event,
        endpoint,
        cacheKey,
        response,
        365
    )


    return response
})
