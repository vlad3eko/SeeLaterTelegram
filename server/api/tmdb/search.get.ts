export default defineEventHandler(async (event) => {
    const query = getQuery(event)

    const config = useRuntimeConfig()

    const headers = {
        accept: 'application/json',
        Authorization: `Bearer ${config.tmdbApiKey}`
    }

    const type = query.media || 'multi'

    const res = await fetch(
        `https://api.themoviedb.org/3/search/${type}?query=${query.q}&language=ru-RU`,
        { headers }
    )

    return await res.json()
})
