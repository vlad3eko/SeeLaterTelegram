export default defineEventHandler(async (event) => {

    const query = getQuery(event)

    const config = useRuntimeConfig()

    const headers = {
        accept: 'applications/json',
        Authorization: `Bearer ${config.tmdbApiKey}`
    }

    const credits = await fetch(`https://api.themoviedb.org/3/${query.media}/${query.id}/credits?language=ru-RU`, {
        headers
    })

    return await credits.json()
})
