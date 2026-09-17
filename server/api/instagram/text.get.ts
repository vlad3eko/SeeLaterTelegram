
export default defineEventHandler(async () => {
    const token = process.env.INSTAGRAM_ACCESS_TOKEN
    const accountId = process.env.INSTAGRAM_ACCOUNT_ID


    if (!token || !accountId) {
        throw createError({
            statusCode: 500,
            statusMessage: 'Instagram environment variables are missing'
        })
    }


    return await $fetch(
        `https://graph.instagram.com/${accountId}`,
        {
            query: {
                fields: 'id,username',
                access_token: token
            }
        }
    )
})
