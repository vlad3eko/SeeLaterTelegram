export default defineEventHandler(async () => {

    const token = process.env.INSTAGRAM_ACCESS_TOKEN
    const accountId = process.env.INSTAGRAM_ACCOUNT_ID

    if (!token || accountId) {
        throw createError({
            statusCode: 500,
            statusMessage: 'Instagram environment variables are missing'
        })
    }

    const imageUrl = 'https://www.themoviedb.org/t/p/w600_and_h900_face/pK8CH9JxrgX2ZIq3WclTwnX0cCL.jpg'
    const caption = 'Тестовая публикация Kinomanovnet'
    const container = await $fetch<{id: string}>(
        `https://graph.instagram.com/v26.0/${accountId}/media`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`
            },
            body: {
                image_url: imageUrl,
                caption
            }
        }
    )

    const published = await $fetch<{id: string}>(
        `https://graph.instagram.com/v26.0/${accountId}/media_publish`,
        {
            method: "POST",
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
