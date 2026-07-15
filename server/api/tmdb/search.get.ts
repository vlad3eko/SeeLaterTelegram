export default defineEventHandler(async (event) => {

    const query = getQuery(event)

    const config = useRuntimeConfig()

    const headers = {
        accept: 'application/json',
        Authorization: `Bearer ${config.tmdbApiKey}`
    }

    const type = query.media || 'multi'
    const params = new URLSearchParams({
        query: String(query.q || '2026'),
        language: 'ru-RU',
        page: String(query.page || 1)
    })

    const res = await fetch(
        `https://api.themoviedb.org/3/search/${type}?${params}`,
        {
            headers
        }
    )

    return await res.json()

})
