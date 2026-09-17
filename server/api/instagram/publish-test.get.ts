export default defineEventHandler(async () => {
    const token = process.env.INSTAGRAM_ACCESS_TOKEN
    const accountId = process.env.INSTAGRAM_ACCOUNT_ID

    if (!token || !accountId) {
        throw createError({
            statusCode: 500,
            statusMessage: 'Instagram environment variables are missing'
        })
    }

    const imageUrl =
        'https://image.tmdb.org/t/p/w1080/nuNOKDt0mVWhwq2HZ9ytczuUFSf.jpg'

    const caption =
        'Тестовая публикация KinomanovNet'

    const container = await $fetch<{ id: string }>(
        `https://graph.instagram.com/v26.0/${accountId}/media`,
        {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`
            },
            body: {
                image_url: imageUrl,
                caption
            }
        }
    )

    const published = await $fetch<{ id: string }>(
        `https://graph.instagram.com/v26.0/${accountId}/media_publish`,
        {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`
            },
            body: {
                creation_id: container.id
            }
        }
    )

    return {
        success: true,
        containerId: container.id,
        mediaId: published.id
    }
})
