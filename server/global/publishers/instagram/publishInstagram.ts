import {instagramGraphUrl} from '#server/global/publishers/instagram/instagramGraphUrl'

export const publishInstagram = async (
    {
        imageUrl, caption
    }: {
        imageUrl: string
        caption: string
    }) => {

    const token =
        process.env.INSTAGRAM_ACCESS_TOKEN

    const accountId =
        process.env.INSTAGRAM_ACCOUNT_ID

    if (!token || !accountId) {
        throw new Error(
            'Instagram environment variables are missing'
        )
    }

    const graphUrl = instagramGraphUrl(token)

    const headers = {
        Authorization:
            `Bearer ${token}`
    }

    const container =
        await $fetch<{ id: string }>(
            `${graphUrl}/${accountId}/media`,
            {
                method: 'POST',
                headers,
                body: {
                    image_url: imageUrl,
                    caption
                }
            }
        )

    const published =
        await $fetch<{ id: string }>(
            `${graphUrl}/${accountId}/media_publish`,
            {
                method: 'POST',
                headers,
                body: {
                    creation_id: container.id
                }
            }
        )

    return {
        containerId: container.id,
        mediaId: published.id
    }
}
