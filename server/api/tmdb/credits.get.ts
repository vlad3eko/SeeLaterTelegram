import {
    buildCacheKey,
    getCache,
    saveCache
} from "#server/global/engine/search/repository/cacheRepository"

export default defineEventHandler(async (event) => {

    const query = getQuery(event)

    const config = useRuntimeConfig()

    const headers = {
        accept: "application/json",
        Authorization: `Bearer ${config.tmdbApiKey}`
    }

    const id =
        Number(query.id || 0)

    const personJob =
        String(query.personJob || "cast")

    if (!id) {
        throw createError({
            statusCode: 400,
            statusMessage: "ID is required"
        })
    }

    /*
     * ==================================================
     * CACHE
     * ==================================================
     */

    const cacheKey =
        buildCacheKey(
            "credits",
            {
                id,
                personJob
            }
        )

    const cache =
        await getCache(
            event,
            cacheKey
        )

    if (cache) {
        return cache
    }

    /*
     * ==================================================
     * TMDB
     * ==================================================
     *
     * Сначала movie.
     * Если такого фильма нет — пробуем tv.
     */

    const params =
        new URLSearchParams({
            language: "ru-RU"
        })

    const tmdbStart =
        performance.now()

    let mediaType:
        "movie" | "tv"

    let credits: any

    /*
     * ==================================================
     * MOVIE
     * ==================================================
     */

    const movieResponse =
        await fetch(
            `https://api.themoviedb.org/3/movie/${id}/credits?${params}`,
            {
                headers
            }
        )

    if (movieResponse.ok) {

        mediaType = "movie"

        credits =
            await movieResponse.json()

    } else {

        /*
         * ==================================================
         * TV
         * ==================================================
         */

        const tvResponse =
            await fetch(
                `https://api.themoviedb.org/3/tv/${id}/credits?${params}`,
                {
                    headers
                }
            )

        if (!tvResponse.ok) {

            throw createError({
                statusCode: 404,
                statusMessage:
                    "Movie or TV credits not found"
            })

        }

        mediaType = "tv"

        credits =
            await tvResponse.json()
    }

    /*
     * ==================================================
     * SELECT CAST / CREW
     * ==================================================
     */

    let results: any[] = []

    if (personJob === "cast") {

        results =
            credits.cast || []

    } else if (personJob === "crew") {

        results =
            credits.crew || []

    } else {

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

        total_pages: 1,

        page: 1,

        mediaType

    }

    /*
     * ==================================================
     * CACHE
     * ==================================================
     */

    await saveCache(
        event,
        "credits",
        cacheKey,
        result,
        90
    )

    console.log(
        `[TMDB] CREDITS ${(performance.now() - tmdbStart).toFixed(2)}ms`,
        {
            id,
            mediaType,
            personJob,
            results: results.length
        }
    )

    return result
})
