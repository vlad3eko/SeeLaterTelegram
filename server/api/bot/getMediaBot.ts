

export default defineEventHandler(async (event) => {

    const query = getQuery(event)

    // media и id подставляются в путь TMDB (в том числе из payload /start), поэтому
    // пропускаем только ожидаемые значения.
    const media = String(query.media ?? '')
    const id = String(query.id ?? '')

    if (media !== 'movie' && media !== 'tv') {
        throw createError({statusCode: 400, statusMessage: 'Invalid media type'})
    }

    if (!/^\d{1,10}$/.test(id)) {
        throw createError({statusCode: 400, statusMessage: 'Invalid media id'})
    }

    const config = useRuntimeConfig()

    const headers = {
        accept: 'application/json',
        Authorization: `Bearer ${config.tmdbApiKey}`
    }

    const [movieRes] = await Promise.all([

        fetch(`https://api.themoviedb.org/3/${media}/${id}?language=ru-RU`, {
            method: 'GET',
            headers
        }),
    ])


    const movie = await movieRes.json()

    return {
        ...movie,
    }

})
