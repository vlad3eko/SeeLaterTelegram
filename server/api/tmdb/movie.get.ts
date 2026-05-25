
export default defineEventHandler(async (event) => {

    const query = getQuery(event)


    const config = useRuntimeConfig()

    const headers = {
        accept: 'application/json',
        Authorization: `Bearer ${config.tmdbApiKey}`
    }

    const [movieRes, trailerRes] = await Promise.all([

        fetch(`https://api.themoviedb.org/3/movie/${query.id}?external_source=imdb_id&language=ru-RU`, {
            method: 'GET',
            headers
        }),
        fetch(`https://api.themoviedb.org/3/movie/${query.id}/videos?language=ru-RU`, {
            method: 'GET',
            headers
        })
    ])


    const movie = await movieRes.json()
    const trailer = await trailerRes.json()

    return {
        ...movie,
        trailers: trailer.results
    }

})
