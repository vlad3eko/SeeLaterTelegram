
export default defineEventHandler(async (event) => {

    const query = getQuery(event)

    const config = useRuntimeConfig()

    const headers = {
        accept: 'application/json',
        Authorization: `Bearer ${config.tmdbApiKey}`
    }

    const [movieRes] = await Promise.all([

        fetch(`https://api.themoviedb.org/3/${query.media}/${query.id}?language=ru-RU`, {
            method: 'GET',
            headers
        }),
    ])


    const movie = await movieRes.json()

    return {
        ...movie,
    }

})
