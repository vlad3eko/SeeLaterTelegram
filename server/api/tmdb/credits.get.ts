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

    const endpoint = "person/credits"

    const personId = Number(query.id || 0)

    const personJob =
        String(query.personJob || "cast")

    if (!personId) {
        throw createError({
            statusCode: 400,
            statusMessage: "Person ID is required"
        })
    }

    const cacheKey = buildCacheKey(
        endpoint,
        {
            id: personId,
            personJob
        }
    )

    const cache = await getCache(
        event,
        cacheKey
    )

    let results: any[] = []

    /*
     * =========================
     * CACHE
     * =========================
     */

    if (cache) {

        // ВАЖНО:
        // поддерживаем оба старых варианта кэша
        results =
            cache.results ||
            cache.result ||
            []

    }

    /*
     * =========================
     * TMDB
     * =========================
     */

    else {

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

        /*
         * CAST
         */

        if (personJob === "cast") {

            results =
                credits.cast || []

        }

        /*
         * CREW
         */

        else if (personJob === "crew") {

            results =
                credits.crew || []

        }

        /*
         * CAST + CREW
         */

        else {

            results = [
                ...(credits.cast || []),
                ...(credits.crew || [])
            ]

        }

        /*
         * CACHE
         *
         * Всегда используем results.
         */

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

    /*
     * =========================
     * RESPONSE
     * =========================
     *
     * Здесь НЕ делаем slice().
     *
     * Возвращаем весь список.
     * Общий search pipeline сам решит,
     * что оставить.
     */

    return {

        page: 1,

        results,

        total_results:
        results.length,

        total_pages:
            results.length > 0
                ? 1
                : 0

    }
})
