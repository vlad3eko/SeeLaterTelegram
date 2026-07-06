export default defineEventHandler(async (event) => {

    const query = getQuery(event)

    const config = useRuntimeConfig()

    const headers = {
        accept: 'application/json',
        Authorization: `Bearer ${config.tmdbApiKey}`
    }

    return await $fetch(
        `https://api.themoviedb.org/3/genre/${query.media}/list?language=ru-RU`,
        {
            headers
        }
    )

})
