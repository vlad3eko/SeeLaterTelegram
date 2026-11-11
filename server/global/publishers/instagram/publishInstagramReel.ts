import {copyFile, mkdir, writeFile} from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'

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

const GRAPH_API_URL = 'https://graph.instagram.com/v26.0'

// Тело запроса на создание контейнера Reel. Его же отправляет сухой прогон в instagram-request.json,
// поэтому файл всегда показывает ровно то, что уйдёт в Instagram.
const buildContainerBody = (videoUrl: string, caption: string) => ({
    media_type: 'REELS',
    video_url: videoUrl,
    caption,
    share_to_feed: true
})

// СУХОЙ ПРОГОН ДЛЯ РАЗРАБОТКИ: INSTAGRAM_DRY_RUN=true.
// В Instagram ничего не отправляется. В папку кладутся ролик (reel.mp4), подпись (caption.txt) и
// instagram-request.json с запросами, которые ушли бы в Graph API (без токена).
// INSTAGRAM_DRY_RUN_DIR: куда писать файлы (если не задана, tmp/instagram-dry-run/<время>).
// Если задана, файлы кладутся прямо в неё. Коллбэки onContainerCreated / onPublished
// не вызываются, чтобы тестовые идентификаторы не попали в базу.
const isInstagramDryRun = (): boolean =>
    process.env.INSTAGRAM_DRY_RUN?.trim().toLowerCase() === 'true'

const assertDryRunIsLocal = (): void => {
    if (process.env.VERCEL === '1' || process.env.CLOUD_RUN_JOB || process.env.K_SERVICE) {
        throw new Error(
            '[INSTAGRAM DRY RUN] INSTAGRAM_DRY_RUN is for local development only and must not be set in Vercel or Cloud Run'
        )
    }
}

const dryRunPublishInstagramReel = async ({
    videoUrl,
    caption,
    existingContainerId
}: PublishInstagramReelInput): Promise<InstagramPublishResult> => {
    assertDryRunIsLocal()

    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const explicitDirectory = process.env.INSTAGRAM_DRY_RUN_DIR?.trim()
    const directory = explicitDirectory
        ? path.resolve(explicitDirectory)
        : path.resolve('tmp', 'instagram-dry-run', stamp)

    await mkdir(directory, {recursive: true})

    const videoPath = path.join(directory, 'reel.mp4')

    if (videoUrl.startsWith('file:')) {
        await copyFile(fileURLToPath(videoUrl), videoPath)
    } else if (/^https?:\/\//i.test(videoUrl)) {
        const response = await fetch(videoUrl)

        if (!response.ok) {
            throw new Error(`[INSTAGRAM DRY RUN] Video download failed: HTTP ${response.status}`)
        }

        await writeFile(videoPath, Buffer.from(await response.arrayBuffer()))
    } else {
        throw new Error(`[INSTAGRAM DRY RUN] Unsupported video URL: ${videoUrl}`)
    }

    const accountId = process.env.INSTAGRAM_ACCOUNT_ID || '<INSTAGRAM_ACCOUNT_ID>'
    const containerId = existingContainerId ?? `dry-run-container-${stamp}`
    const mediaId = `dry-run-${stamp}`

    const request = {
        dryRun: true,
        note: 'Nothing was sent to Instagram. Token is never written here.',
        createdAt: new Date().toISOString(),
        videoFile: videoPath,
        videoUrl,
        calls: [
            {
                step: 'create container',
                method: 'POST',
                url: `${GRAPH_API_URL}/${accountId}/media`,
                headers: {Authorization: 'Bearer <INSTAGRAM_ACCESS_TOKEN>'},
                body: buildContainerBody(videoUrl, caption),
                skipped: Boolean(existingContainerId)
            },
            {
                step: 'poll container status',
                method: 'GET',
                url: `${GRAPH_API_URL}/${containerId}?fields=status_code,status`
            },
            {
                step: 'publish',
                method: 'POST',
                url: `${GRAPH_API_URL}/${accountId}/media_publish`,
                body: {creation_id: containerId}
            }
        ]
    }

    await writeFile(path.join(directory, 'caption.txt'), caption, 'utf8')
    await writeFile(
        path.join(directory, 'instagram-request.json'),
        `${JSON.stringify(request, null, 2)}\n`,
        'utf8'
    )

    console.log('[INSTAGRAM DRY RUN] Nothing was sent to Instagram', {
        directory,
        captionLength: caption.length
    })

    return {
        containerId,
        mediaId,
        permalink: pathToFileURL(directory).href
    }
}

export const publishInstagramReel = async ({
    videoUrl,
    caption,
    existingContainerId,
    onContainerCreated,
    onPublished
}: PublishInstagramReelInput): Promise<InstagramPublishResult> => {
    if (isInstagramDryRun()) {
        return dryRunPublishInstagramReel({
            videoUrl,
            caption,
            existingContainerId,
            onContainerCreated,
            onPublished
        })
    }

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
                body: buildContainerBody(videoUrl, caption)
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
