export const publishInstagramReel = async ({
                                               videoUrl,
                                               caption
                                           }: {
    videoUrl: string
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

    const container =
        await $fetch<{ id: string }>(
            `https://graph.instagram.com/v26.0/${accountId}/media`,
            {
                method: 'POST',
                headers: {
                    Authorization:
                        `Bearer ${token}`
                },
                body: {
                    media_type: 'REELS',
                    video_url: videoUrl,
                    caption,
                    share_to_feed: true
                }
            }
        )

    const maxAttempts = 20

    for (let attempt = 0; attempt < maxAttempts; attempt++) {

        await new Promise(resolve =>
            setTimeout(resolve, 5000)
        )

        const status =
            await $fetch<{
                status_code?: string
                status?: string
            }>(
                `https://graph.instagram.com/v26.0/${container.id}`,
                {
                    query: {
                        fields: 'status_code,status'
                    },
                    headers: {
                        Authorization:
                            `Bearer ${token}`
                    }
                }
            )

        if (status.status_code === 'FINISHED') {
            break
        }

        if (
            status.status_code === 'ERROR' ||
            status.status_code === 'EXPIRED'
        ) {
            throw new Error(
                `Instagram Reel processing failed: ${
                    status.status || status.status_code
                }`
            )
        }

        if (attempt === maxAttempts - 1) {
            throw new Error(
                `Instagram Reel processing timeout: ${
                    status.status || status.status_code
                }`
            )
        }
    }

    const published =
        await $fetch<{ id: string }>(
            `https://graph.instagram.com/v26.0/${accountId}/media_publish`,
            {
                method: 'POST',
                headers: {
                    Authorization:
                        `Bearer ${token}`
                },
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
