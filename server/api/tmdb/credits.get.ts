import {
    buildCacheKey,
    getCache,
    saveCache
} from "#server/global/engine/search/repository/cacheRepository"


type MediaType =
    "person"
    | "movie"
    | "tv"


/*
 * ==================================================
 * RESOLVE MEDIA TYPE
 *
 * Если mediaType передан явно —
 * используем его.
 *
 * Если нет —
 * проверяем movie → tv.
 *
 * person сюда не включаем,
 * потому что person используется
 * старым сценарием #person.
 * ==================================================
 */

const resolveMediaType = async (
    id: number,
    headers: Record<string, string>
): Promise<"movie" | "tv"> => {

    /*
     * =========================
     * MOVIE
     * =========================
     */

    const movieRes =
        await fetch(
            `https://api.themoviedb.org/3/movie/${id}`,
            {
                headers
            }
        )


    if (movieRes.ok) {

        return "movie"
    }


    /*
     * =========================
     * TV
     * =========================
     */

    const tvRes =
        await fetch(
            `https://api.themoviedb.org/3/tv/${id}`,
            {
                headers
            }
        )


    if (tvRes.ok) {

        return "tv"
    }


    throw createError({
        statusCode: 404,
        statusMessage:
            `TMDB movie or TV not found: ${id}`
    })
}


export default defineEventHandler(async (event) => {

    const query =
        getQuery(event)

    const config =
        useRuntimeConfig()


    const headers = {

        accept:
            "application/json",

        Authorization:
            `Bearer ${config.tmdbApiKey}`

    }


    /*
     * ==================================================
     * PARAMS
     * ==================================================
     */

    const id =
        Number(query.id || 0)


    const personJob =
        String(
            query.personJob || "cast"
        )


    /*
     * mediaType теперь OPTIONAL.
     *
     * person → старый #person
     * movie/tv → можно передать явно
     * undefined → auto detect
     */

    const requestedMediaType =
        query.mediaType
            ? String(query.mediaType)
            : null


    if (!id) {

        throw createError({
            statusCode: 400,
            statusMessage:
                "ID is required"
        })
    }


    /*
     * ==================================================
     * RESOLVE MEDIA TYPE
     * ==================================================
     */

    let mediaType: MediaType


    if (
        requestedMediaType === "person"
        || requestedMediaType === "movie"
        || requestedMediaType === "tv"
    ) {

        /*
         * Явно переданный тип.
         *
         * Это используется старым
         * сценарием #person.
         */

        mediaType =
            requestedMediaType

    }

    else {

        /*
         * Новый сценарий:
         *
         * 634649 #cast
         *
         * credits сам определяет
         * movie или tv.
         */

        mediaType =
            await resolveMediaType(
                id,
                headers
            )
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
     * ==================================================
     */

    if (mediaType === "person") {

        url =
            `https://api.themoviedb.org/3/person/${id}/combined_credits?${params}`
    }


    /*
     * ==================================================
     * MOVIE
     * ==================================================
     */

    else if (mediaType === "movie") {

        url =
            `https://api.themoviedb.org/3/movie/${id}/credits?${params}`
    }


    /*
     * ==================================================
     * TV
     * ==================================================
     */

    else {

        url =
            `https://api.themoviedb.org/3/tv/${id}/credits?${params}`
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
