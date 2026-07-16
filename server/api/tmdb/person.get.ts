import {buildCacheKey, getCache, saveCache} from "~/utils/search/repository/cacheRepository";

export default defineEventHandler(async (event) => {
    const query = getQuery(event)
    const config = useRuntimeConfig()
    const headers = {
        accept: 'application/json',
        Authorization: `Bearer ${config.tmdbApiKey}`
    }

    const endpoint = 'person'

    const cacheKey = buildCacheKey(endpoint, {
        id: query.id
    })

    const cache = await getCache(event, cacheKey)
    if (cache) return cache

    const tmdbStart =
        performance.now()

    const res = await fetch(`https://api.themoviedb.org/3/person/${query.id}?append_to_response=combined_credits,images,external_ids&language=ru-RU`,
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
