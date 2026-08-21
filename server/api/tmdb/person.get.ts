import {buildCacheKey, getCache, saveCache} from "#server/global/engine/search/repository/cacheRepository";

export default defineEventHandler(async (event) => {
    const query = getQuery(event)
    const config = useRuntimeConfig()
    const headers = {
        accept: 'application/json',
        Authorization: `Bearer ${config.tmdbApiKey}`
    }

    const endpoint = 'person'
    const q = String(query.q || "").trim()
    const personId = Number(query.id || 0)
    const personJob = String(query.personJob || 'cast')
    const page = String(query.page || 1)

    const cacheKey = buildCacheKey(endpoint, {
        id: personId
    })

    const cache = await getCache(event, cacheKey)
    if (cache) return cache

    const params = new URLSearchParams({
        language: "ru-RU",
    })

    const tmdbStart =
        performance.now()

    const res = await fetch(`https://api.themoviedb.org/3/person/${personId}?${params}`,
        { headers  }
    )

    if (!res.ok) {
        throw createError({
            statusCode: res.status,
            statusMessage: await res.text()
        })
    }

    const response = await res.json()

    await saveCache(event,endpoint,cacheKey, response, 90)

    console.log(
        `[TMDB] PERSON ${(performance.now()-tmdbStart).toFixed(2)}ms`
    )

    return response
})
