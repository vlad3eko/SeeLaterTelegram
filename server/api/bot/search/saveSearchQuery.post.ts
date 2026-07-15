export default defineEventHandler(async (event) => {
    const query = getQuery(event)

    console.log('query q', query.q)
    console.log('query media_type', query.media_type)
    console.log('query user_id', query.user_id)
})
