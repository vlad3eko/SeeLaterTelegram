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

    let result

    if (cache) {
        result = cache.results || []
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

            result = credits.cast || []

        } else if (personJob === "crew") {

            result = credits.crew || []

        } else {

            result = [
                ...(credits.cast || []),
                ...(credits.crew || [])
            ]
        }

        await saveCache(
            event,
            endpoint,
            cacheKey,
            {
                result
            },
            90
        )

        console.log(
            `[TMDB] PERSON CREDITS ${(performance.now() - tmdbStart).toFixed(2)}ms`
        )
    }

    /*
     * =========================
     * PAGINATION
     * =========================
     */

    const totalResults = result.length

    const totalPages = Math.ceil(
        totalResults / PAGE_SIZE
    )

    const start = (page - 1) * PAGE_SIZE
    const end = start + PAGE_SIZE

    return {
        page,
        results: result,
        total_pages: totalPages,
        total_results: totalResults
    }
})
