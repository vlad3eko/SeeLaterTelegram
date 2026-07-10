
export default defineEventHandler(async (event) => {

    const query = getQuery(event)

    const config = useRuntimeConfig()

    const headers = {
        accept: 'application/json',
        Authorization: `Bearer ${config.tmdbApiKey}`
    }

    const media = query.media || 'multi'

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

    return {
        ...movie,
        media_type,
        trailers: [...trailerRus.results,...trailerEng.results]
    }

})
