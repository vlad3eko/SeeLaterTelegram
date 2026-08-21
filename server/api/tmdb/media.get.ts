import {buildCacheKey, getCache, saveCache} from "#server/global/engine/search/repository/cacheRepository";

export default defineEventHandler(async (event) => {
    const query = getQuery(event)
    const config = useRuntimeConfig()
    const headers = {
        accept: 'application/json',
        Authorization: `Bearer ${config.tmdbApiKey}`
    }

    const id = Number(query.id)
    const media = query.media || 'multi'
    const endpoint = 'media'

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

    const cacheKey = buildCacheKey(endpoint, {
        media,
        id
    })

    const cache = await getCache(event, cacheKey)
    if (cache) return cache

    const tmdbStart =
        performance.now()

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
    const trailerRus = await trailerRu.json()
    const trailerEng = await trailerEn.json()

    const ruResults = Array.isArray(trailerRus.results)
        ? trailerRus.results
        : []

    const enResults = Array.isArray(trailerEng.results)
        ? trailerEng.results
        : []

    const response = {
        ...movie,
        media_type: media,
        trailers: [
            ...ruResults,
            ...enResults
        ]
    }

    await saveCache(event, endpoint, cacheKey, response, 30)

    console.log(
        `[TMDB] MEDIA ${(performance.now()-tmdbStart).toFixed(2)}ms`
    )

    return response
})
