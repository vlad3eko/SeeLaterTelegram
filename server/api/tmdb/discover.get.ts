export default defineEventHandler(async (event) => {

    const query = getQuery(event)
    const config = useRuntimeConfig()
    console.log('query discover', query)

    const headers = {
        accept: 'application/json',
        Authorization: `Bearer ${config.tmdbApiKey}`
    }

    const media = query.media || 'movie'
    const params = new URLSearchParams({
        language: 'ru-RU',
        page: String(query.page || 1),
    })

    if(query.with_genres){
        params.append(
            'with_genres',
            String(query.with_genres)
        )
    }

    if(query.sort_by){
        params.append(
            'sort_by',
            String(query.sort_by)
        )
    }

    const res = await fetch(
        `https://api.themoviedb.org/3/discover/${media}?${params}`,
        {
            headers
        }
    )

    return await res.json()
})
