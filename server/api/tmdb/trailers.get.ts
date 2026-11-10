
export default defineEventHandler(async (event) => {

    const query = getQuery(event)

    const config = useRuntimeConfig()

    // media и id попадают в путь запроса к TMDB, поэтому проверяем их строго.
    const id = Number(query.id)

    if (
        (query.media !== 'movie' && query.media !== 'tv') ||
        !Number.isSafeInteger(id) ||
        id <= 0
    ) {
        throw createError({
            status: 400,
            message: "Invalid request"
        })
    }

    const headers = {
        accept: 'application/json',
        Authorization: `Bearer ${config.tmdbApiKey}`
    }

    const [trailerRu, trailerEn] = await Promise.all([

        fetch(`https://api.themoviedb.org/3/${query.media}/${id}/videos?language=ru-RU`, {
            method: 'GET',
            headers
        }),
        fetch(`https://api.themoviedb.org/3/${query.media}/${id}/videos?language=en-EN`, {
            method: 'GET',
            headers
        })
    ])


    const trailerRus = await trailerRu.json()
    const trailerEng = await trailerEn.json()

    const ruResults = Array.isArray(trailerRus.results)
        ? trailerRus.results
        : []

    const enResults = Array.isArray(trailerEng.results)
        ? trailerEng.results
        : []

    return {
        trailers: [
            ...ruResults,
            ...enResults
        ]
    }
})
