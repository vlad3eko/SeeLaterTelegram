import {buildCacheKey, getCache, saveCache} from "~/utils/search/repository/cacheRepository";

export default defineEventHandler(async (event) => {
    const query = getQuery(event)
    const config = useRuntimeConfig()
    const headers = {
        accept: 'application/json',
        Authorization: `Bearer ${config.tmdbApiKey}`
    }

    const endpoint = 'credits'

    const cacheKey = buildCacheKey(endpoint, {
        media: query.media,
        id: query.id
    })

    const cache = await getCache(event, cacheKey)
    if (cache) return cache

    const credits = await fetch(`https://api.themoviedb.org/3/${query.media}/${query.id}/credits?language=ru-RU`, {
        headers
    })

    if (!credits.ok) {
        throw createError({
            statusCode: credits.status,
            statusMessage: await credits.text()
        })
    }

    const response = await credits.json()

    await saveCache(event, endpoint, cacheKey, response, 30)

    return response

})
