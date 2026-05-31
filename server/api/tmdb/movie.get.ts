
export default defineEventHandler(async (event) => {

    const query = getQuery(event)

    const config = useRuntimeConfig()

    const headers = {
        accept: 'application/json',
        Authorization: `Bearer ${config.tmdbApiKey}`
    }

    const [movieRes, trailerRu, trailerEn] = await Promise.all([

        fetch(`https://api.themoviedb.org/3/${query.media}/${query.id}?external_source=imdb_id&language=ru-RU`, {
            method: 'GET',
            headers
        }),
        fetch(`https://api.themoviedb.org/3/${query.media}/${query.id}/videos?language=ru-RU`, {
            method: 'GET',
            headers
        }),
        fetch(`https://api.themoviedb.org/3/${query.media}/${query.id}/videos?language=en-EN`, {
            method: 'GET',
            headers
        })
    ])


    const movie = await movieRes.json()
    const trailerRus = await trailerRu.json()
    const trailerEng = await trailerEn.json()

    return {
        ...movie,
        trailers: [...trailerRus.results,...trailerEng.results]
    }

})
