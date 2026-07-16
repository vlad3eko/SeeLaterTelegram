import {buildCacheKey, getCache, saveCache} from "~/utils/search/repository/cacheRepository";

export default defineEventHandler(async (event) => {
    const query = getQuery(event)
    const config = useRuntimeConfig()
    const headers = {
        accept: "application/json",
        Authorization: `Bearer ${config.tmdbApiKey}`
    }
    const params = new URLSearchParams({
        query: String(query.q || ""),
        language: "ru-RU",
        page: String(query.page || 1)
    })

    const endpoint = "search"
    const media = query.media || "multi"

    const cacheKey = buildCacheKey(endpoint, {
        media,
        q: query.q,
        page: query.page
    })

    const cache = await getCache(event, cacheKey)
    if (cache) return cache

    const res = await fetch(`https://api.themoviedb.org/3/search/${media}?${params}`, {
            headers
        })

    if (!res.ok) {
        throw createError({
            statusCode: res.status,
            statusMessage: await res.text()
        })
    }

    const response = await res.json()

    await saveCache(event, endpoint, cacheKey, response, 7)

    return response
})
