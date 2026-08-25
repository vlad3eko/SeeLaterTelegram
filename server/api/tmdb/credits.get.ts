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


    /*
     * ==================================================
     * PARAMS
     * ==================================================
     */

    const id =
        Number(query.id || 0)

    const personJob =
        String(query.personJob || "cast")

    const mediaType =
        String(query.mediaType || "person")


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

    const endpoint =
        mediaType === "person"
            ? "person/credits"
            : `${mediaType}/credits`


    const cacheKey =
        buildCacheKey(
            endpoint,
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
     *
     * /person/{id}/combined_credits
     *
     * Результат:
     * фильмы и сериалы, где участвовал человек
     * ==================================================
     */

    if (mediaType === "person") {

        url =
            `https://api.themoviedb.org/3/person/${id}/combined_credits?${params}`

    }


    /*
     * ==================================================
     * MOVIE
     *
     * /movie/{id}/credits
     *
     * Результат:
     * люди, участвовавшие в фильме
     * ==================================================
     */

    else if (mediaType === "movie") {

        url =
            `https://api.themoviedb.org/3/movie/${id}/credits?${params}`

    }


    /*
     * ==================================================
     * TV
     *
     * /tv/{id}/credits
     *
     * Результат:
     * люди, участвовавшие в сериале
     * ==================================================
     */

    else if (mediaType === "tv") {

        url =
            `https://api.themoviedb.org/3/tv/${id}/credits?${params}`

    }


    else {

        throw createError({
            statusCode: 400,
            statusMessage:
                `Unsupported mediaType: ${mediaType}`
        })

    }


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


    /*
     * PERSON
     *
     * Здесь cast / crew относятся
     * к фильмографии человека
     */

    if (mediaType === "person") {

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

    }


    /*
     * MOVIE / TV
     *
     * Здесь cast / crew уже являются
     * людьми.
     */

    else {

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

        page: 1

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
            results: results.length
        }
    )


    return result
})
