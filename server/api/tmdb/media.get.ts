
export default defineEventHandler(async (event) => {

    const query = getQuery(event)
    const id = Number(query.id)

    const config = useRuntimeConfig()

    const headers = {
        accept: 'application/json',
        Authorization: `Bearer ${config.tmdbApiKey}`
    }

    const media = query.media || 'multi'

    if (media !== "movie" && media !== "tv") {
        throw createError({
            statusCode: 400,
            statusMessage: "Invalid media type"
        })
    }

    if (
        Number.isNaN(id) ||
        !["movie", "tv"].includes(String(media))
    ) {
        throw createError({
            statusCode: 400,
            statusMessage: "Invalid request"
        })
    }

    const [movieRes, trailerRu, trailerEn] = await Promise.all([

        fetch(`https://api.themoviedb.org/3/${media}/${query.id}?external_source=imdb_id&language=ru-RU`, {
            method: 'GET',
            headers
        }),
        fetch(`https://api.themoviedb.org/3/${media}/${query.id}/videos?language=ru-RU`, {
            method: 'GET',
            headers
        }),
        fetch(`https://api.themoviedb.org/3/${media}/${query.id}/videos?language=en-EN`, {
            method: 'GET',
            headers
        })
    ])


    const movie = await movieRes.json()
    const media_type = query.media
    const trailerRus = await trailerRu.json()
    const trailerEng = await trailerEn.json()

    const ruResults = Array.isArray(trailerRus.results)
        ? trailerRus.results
        : []

    const enResults = Array.isArray(trailerEng.results)
        ? trailerEng.results
        : []

    return {
        ...movie,
        media_type: media,
        trailers: [
            ...ruResults,
            ...enResults
        ]
    }

})
