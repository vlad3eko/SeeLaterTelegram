export default defineEventHandler(async (event) => {
    const query = getQuery(event)

    console.log('query api', query)
})
