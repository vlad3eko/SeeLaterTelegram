import {buildCacheKey, getCache, saveCache} from "#server/global/engine/search/repository/cacheRepository";

export default defineEventHandler(async (event) => {

    const query = getQuery(event)
    const config = useRuntimeConfig()


    const headers = {
        accept: "application/json",
        Authorization: `Bearer ${config.tmdbApiKey}`
    }

    const media = String(query.media || "multi")
    const q = String(query.q || "").trim()
    const page = String(query.page || 1)

    // #person без поискового текста → популярные люди
    const isPopularPerson = media === "person" && !q

    const endpoint = isPopularPerson
        ? "person/popular"
        : "search"

    const cacheKey = buildCacheKey(endpoint, {
        media,
        q,
        page
    })

    const cache = await getCache(event, cacheKey)

    if (cache) {
        return cache
    }

    const tmdbStart = performance.now()

    let response

    if (isPopularPerson) {

        const params = new URLSearchParams({
            language: "ru-RU",
            page
        })

        const res = await fetch(
            `https://api.themoviedb.org/3/person/popular?${params}`,
            {
                headers
            }
        )

        if (!res.ok) {
            throw createError({
                statusCode: res.status,
                statusMessage: await res.text()
            })
        }

        response = await res.json()

    } else {

        const params = new URLSearchParams({
            query: q,
            language: "ru-RU",
            page
        })

        const res = await fetch(
            `https://api.themoviedb.org/3/search/${media}?${params}`,
            {
                headers
            }
        )

        if (!res.ok) {
            throw createError({
                statusCode: res.status,
                statusMessage: await res.text()
            })
        }

        response = await res.json()
    }

    await saveCache(
        event,
        endpoint,
        cacheKey,
        response,
        7
    )

    console.log(
        `[TMDB] ${isPopularPerson ? "PERSON POPULAR" : "SEARCH"} ${(performance.now() - tmdbStart).toFixed(2)}ms`
    )

    return response
})
