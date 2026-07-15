export default defineEventHandler(async (event) => {
    const query = getQuery(event)
    const config = useRuntimeConfig()

    const media = query.media === "tv" ? "tv" : "movie"
    console.log('query', query)
    const res = await fetch(
        `https://api.themoviedb.org/3/${media}/popular?language=ru-RU&page=${query.page ?? 1}`,
        {
            headers: {
                accept: "application/json",
                Authorization: `Bearer ${config.tmdbApiKey}`
            }
        }
    )

    if (!res.ok) {
        throw createError({
            statusCode: res.status,
            statusMessage: await res.text()
        })
    }

    return res.json()
})
