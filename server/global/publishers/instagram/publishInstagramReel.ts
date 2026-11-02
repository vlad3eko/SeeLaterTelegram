type InstagramPublishResult = {
    containerId: string
    mediaId: string
    permalink?: string
}

type PublishInstagramReelInput = {
    videoUrl: string
    caption: string
    existingContainerId?: string
    onContainerCreated?: (containerId: string) => Promise<void> | void
    onPublished?: (result: {containerId: string; mediaId: string}) => Promise<void> | void
}

export const publishInstagramReel = async ({
    videoUrl,
    caption,
    existingContainerId,
    onContainerCreated,
    onPublished
}: PublishInstagramReelInput): Promise<InstagramPublishResult> => {
    const token = process.env.INSTAGRAM_ACCESS_TOKEN
    const accountId = process.env.INSTAGRAM_ACCOUNT_ID

    if (!token || !accountId) {
        throw new Error('Instagram environment variables are missing')
    }

    let containerId = existingContainerId

    if (!containerId) {
        const container = await $fetch<{id: string}>(
            `https://graph.instagram.com/v26.0/${accountId}/media`,
            {
                method: 'POST',
                headers: {Authorization: `Bearer ${token}`},
                body: {
                    media_type: 'REELS',
                    video_url: videoUrl,
                    caption,
                    share_to_feed: true
                }
            }
        )

        containerId = container.id

        console.log('[INSTAGRAM REEL CREATE]', JSON.stringify(container, null, 2))
        await onContainerCreated?.(containerId)
    } else {
        console.log('[INSTAGRAM REEL RESUME]', {containerId})
    }

    const maxAttempts = 20
    let isFinished = false

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 5000))

        const status = await $fetch<Record<string, any>>(
            `https://graph.instagram.com/v26.0/${containerId}`,
            {
                query: {fields: 'status_code,status'},
                headers: {Authorization: `Bearer ${token}`}
            }
        )

        console.log('[INSTAGRAM REEL STATUS]', JSON.stringify(status, null, 2))

        if (status.status_code === 'FINISHED') {
            isFinished = true
            break
        }

        if (status.status_code === 'ERROR' || status.status_code === 'EXPIRED') {
            throw new Error(
                `Instagram Reel processing failed: ${status.status || status.status_code}`
            )
        }

        if (attempt === maxAttempts - 1) {
            throw new Error(
                `Instagram Reel processing timeout: ${status.status || status.status_code}`
            )
        }
    }

    if (!isFinished) {
        throw new Error('Instagram Reel container did not reach FINISHED status')
    }

    const published = await $fetch<{id: string}>(
        `https://graph.instagram.com/v26.0/${accountId}/media_publish`,
        {
            method: 'POST',
            headers: {Authorization: `Bearer ${token}`},
            body: {creation_id: containerId}
        }
    )

    // Сохраняем Instagram media id сразу после успешного ответа media_publish.
    // Если последующий запрос permalink завершится ошибкой, повторная публикация
    // не потребуется: финализатор уже сможет пропустить media_publish.
    await onPublished?.({containerId, mediaId: published.id})

    let permalink: string | undefined
    try {
        const media = await $fetch<{permalink?: string}>(
            `https://graph.instagram.com/v26.0/${published.id}`,
            {
                query: {fields: 'permalink'},
                headers: {Authorization: `Bearer ${token}`}
            }
        )
        permalink = media.permalink
    } catch (error: any) {
        console.warn('[INSTAGRAM PERMALINK LOOKUP ERROR]', error?.data?.error?.message || error?.message || error)
    }

    return {
        containerId,
        mediaId: published.id,
        permalink
    }
}
