
export default defineEventHandler(async () => {
    const token = process.env.INSTAGRAM_ACCESS_TOKEN
    const accountId = process.env.INSTAGRAM_ACCOUNT_ID

    console.log('enter')

    if (!token || !accountId) {
        console.log('failed')
        throw createError({
            statusCode: 500,
            statusMessage: 'Instagram environment variables are missing'
        })
    }

    console.log('success')

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
