import {
    buildCacheKey,
    getCache,
    saveCache
} from "#server/global/engine/search/repository/cacheRepository"

export default defineEventHandler(async (event) => {

    const query =
        getQuery(event)

    const config =
        useRuntimeConfig()


    const headers = {
        accept: "application/json",
        Authorization: `Bearer ${config.tmdbApiKey}`
    }


    /*
     * ==================================================
     * PARAMS
     * ==================================================
     */

    const id = Number(query.id || 0)
    const personJob = String(query.personJob || "cast")
    const mediaType = String(query.mediaType)

    if (!['movie', 'tv', 'person'].includes(mediaType)) {
        throw createError({
            statusCode: 400,
            statusMessage: "Invalid mediaType"
        })
    }

    /*
     * ==================================================
     * CACHE
     * ==================================================
     */

    const endpoint = `${mediaType}/credits`


    const cacheKey =
        buildCacheKey(
            endpoint,
            {
                id,
                personJob,
                mediaType
            }
        )


    const cache =
        await getCache(event, cacheKey)


    if (cache) {
        return cache
    }


    /*
     * ==================================================
     * TMDB REQUEST
     * ==================================================
     */

    const params =
        new URLSearchParams({
            language: "ru-RU"
        })


    const tmdbStart =
        performance.now()


    let url: string


    /*
     * ==================================================
     * PERSON
     * ==================================================
     */

    if (mediaType === "person") {

        url =
            `https://api.themoviedb.org/3/person/${id}/combined_credits?${params}`
    }

    else {
        url =
            `https://api.themoviedb.org/3/${mediaType}/${id}/credits?${params}`
    }


    /*
     * ==================================================
     * REQUEST
     * ==================================================
     */

    const res =
        await fetch(
            url,
            {
                headers
            }
        )


    if (!res.ok) {

        throw createError({
            statusCode: res.status,
            statusMessage:
                await res.text()
        })
    }


    const credits =
        await res.json()


    /*
     * ==================================================
     * SELECT RESULTS
     * ==================================================
     */

    let results: any[] = []


    if (personJob === "cast") {

        results =
            credits.cast || []
    }

    else if (personJob === "crew") {

        results =
            credits.crew || []
    }

    else {

        results = [
            ...(credits.cast || []),
            ...(credits.crew || [])
        ]
    }


    /*
     * ==================================================
     * RESPONSE
     * ==================================================
     */

    const result = {

        results,

        total_results:
        results.length,

        total_pages:
            1,

        page:
            1

    }


    /*
     * ==================================================
     * CACHE
     * ==================================================
     */

    await saveCache(
        event,
        endpoint,
        cacheKey,
        result,
        90
    )


    console.log(
        `[TMDB] CREDITS ${(performance.now() - tmdbStart).toFixed(2)}ms`,
        {
            mediaType,
            id,
            personJob,
            results:
            results.length
        }
    )

    return result
})
