import {
    buildCacheKey,
    getCache,
    saveCache
} from "#server/global/engine/search/repository/cacheRepository";

export default defineEventHandler(async (event) => {

    const query = getQuery(event)

    const config = useRuntimeConfig()

    const headers = {
        accept: "application/json",
        Authorization: `Bearer ${config.tmdbApiKey}`
    }


    const personId =
        Number(query.id || 0)


    if (!personId) {

        throw createError({
            statusCode: 400,
            statusMessage: "Person ID is required"
        })

    }


    const endpoint =
        "person"


    /*
     * ==================================================
     * CACHE
     * ==================================================
     */

    const cacheKey =
        buildCacheKey(
            endpoint,
            {
                id: personId
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
     */

    const params =
        new URLSearchParams({
            language: "ru-RU"
        })


    const tmdbStart =
        performance.now()


    /*
     * Получаем:
     *
     * 1. Информацию о человеке
     * 2. Его фильмографию
     */

    const [
        personResponse,
        creditsResponse
    ] = await Promise.all([

        fetch(
            `https://api.themoviedb.org/3/person/${personId}?${params}`,
            {
                headers
            }
        ),

        fetch(
            `https://api.themoviedb.org/3/person/${personId}/combined_credits?${params}`,
            {
                headers
            }
        )

    ])


    /*
     * ==================================================
     * Проверяем person
     * ==================================================
     */

    if (!personResponse.ok) {

        throw createError({
            statusCode: personResponse.status,
            statusMessage:
                await personResponse.text()
        })

    }


    /*
     * ==================================================
     * Проверяем credits
     * ==================================================
     */

    if (!creditsResponse.ok) {

        throw createError({
            statusCode: creditsResponse.status,
            statusMessage:
                await creditsResponse.text()
        })

    }


    const person =
        await personResponse.json()


    const credits =
        await creditsResponse.json()


    /*
     * ==================================================
     * Объединяем
     * ==================================================
     */

    const response = {

        ...person,

        combined_credits: {

            cast:
                credits.cast || [],

            crew:
                credits.crew || []

        }

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
        response,
        90
    )


    console.log(
        `[TMDB] PERSON + CREDITS ${(performance.now() - tmdbStart).toFixed(2)}ms`
    )


    return response
})
