export default defineEventHandler(async (event) => {

    const query = getQuery(event)

    const config = useRuntimeConfig()

    const headers = {
        accept: 'application/json',
        Authorization: `Bearer ${config.tmdbApiKey}`
    }

    const res = await fetch(`https://api.themoviedb.org/3/person/${query.id}
                                   ?append_to_response=combined_credits,images,external_ids
                                   &language=ru-RU`, {
        headers
    })

    return await res.json()
})
