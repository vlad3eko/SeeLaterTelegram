export default defineEventHandler(async (event) => {

    const query = getQuery(event)

    const config = useRuntimeConfig()

    const headers = {
        accept: 'application/json',
        Authorization: `Bearer ${config.tmdbApiKey}`
    }

    const media = query.media || 'movie'

    const params = new URLSearchParams({
        language: 'ru-RU',
        page: String(query.page || 1)
    })

    const res = await fetch(
        `https://api.themoviedb.org/3/${media}/popular?${params}`,
        { headers }
    )

    console.log('res', res)

    const answer = await res.json()

    return {
        result: answer.data
    }
})
