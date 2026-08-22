import {
    buildCacheKey,
    getCache,
    saveCache
} from "#server/global/engine/search/repository/cacheRepository"
import {filterTmdbMediaResults} from "~/utils/media/filterTmdbMediaResults";

export default defineEventHandler(async (event) => {

    const query = getQuery(event)
    const config = useRuntimeConfig()

    const headers = {
        accept: "application/json",
        Authorization: `Bearer ${config.tmdbApiKey}`
    }

    const endpoint = "person/credits"

    const personId = Number(query.id || 0)
    const personJob = String(query.personJob || "cast")
    const page = Math.max(
        Number(query.page || 1),
        1
    )

    const PAGE_SIZE = 20

    if (!personId) {
        throw createError({
            statusCode: 400,
            statusMessage: "Person ID is required"
        })
    }

    const cacheKey = buildCacheKey(endpoint, {
        id: personId,
        personJob
    })

    const cache = await getCache(event, cacheKey)

    let results

    if (cache) {
        results = cache.results || []
    } else {

        const params = new URLSearchParams({
            language: "ru-RU"
        })

        const tmdbStart = performance.now()

        const res = await fetch(
            `https://api.themoviedb.org/3/person/${personId}/combined_credits?${params}`,
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

        const credits = await res.json()

        if (personJob === "cast") {

            results = credits.cast || []

        } else if (personJob === "crew") {

            results = credits.crew || []

        } else {

            results = [
                ...(credits.cast || []),
                ...(credits.crew || [])
            ]
        }

        await saveCache(
            event,
            endpoint,
            cacheKey,
            {
                results
            },
            90
        )

        console.log(
            `[TMDB] PERSON CREDITS ${(performance.now() - tmdbStart).toFixed(2)}ms`
        )
    }


    return {
        results: results,
    }
})
