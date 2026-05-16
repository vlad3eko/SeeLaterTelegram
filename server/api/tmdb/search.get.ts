export default defineEventHandler(async (event) => {

    const query = getQuery(event)

    const config = useRuntimeConfig()

    const headers = {
        accept: 'applications/json',
        Authorization: `Bearer ${config.tmdbApiKey}`
    }

    const res = await fetch(`https://api.themoviedb.org/3/search/movie?query=${query.q}&language=ru-RU`, {
        headers
    })

    return await res.json()
})
