import {normalizeTrailer} from "#server/global/engine/instagram/reel/utils/normalizeTrailer"
import {telegramSendVideo} from "#server/global/engine/instagram/reel/utils/telegramSendVideo"
import {downloadTrailer} from "#server/global/engine/instagram/reel/utils/downloadTrailer"
import {mkdir, unlink, writeFile} from "node:fs/promises"
import {prepareInstagramVideo} from "#server/global/engine/instagram/reel/utils/prepareInstagramVideo"
import {decorateInstagramVideo} from "#server/global/engine/instagram/reel/utils/decorateInstagramVideo"
import {
    deleteFromCloudflareR2,
    existsInCloudflareR2,
    getCloudflareR2Url,
    storageCloudflareR2
} from "#server/global/engine/instagram/reel/utils/storageCloudflareR2"
import path from "node:path"
import {randomUUID} from "node:crypto"
import os from "node:os"

const runReelStep = async <T>(
    name: string,
    action: () => Promise<T>
): Promise<T> => {
    const startedAt = Date.now()

    console.log(`[REEL STEP START] ${name}`)

    try {
        const result = await action()

        console.log(`[REEL STEP DONE] ${name}`, {
            durationMs: Date.now() - startedAt
        })

        return result
    } catch (error) {
        console.error(`[REEL STEP ERROR] ${name}`, {
            durationMs: Date.now() - startedAt,
            error
        })

        throw error
    }
}

const downloadR2ObjectToFile = async (
    url: string,
    outputPath: string
): Promise<void> => {
    if (!url) {
        throw new Error('[R2 CLEAN CACHE] URL is missing')
    }

    const response = await fetch(url)

    if (!response.ok) {
        throw new Error(
            `[R2 CLEAN CACHE] Download failed: HTTP ${response.status}`
        )
    }

    const buffer = Buffer.from(await response.arrayBuffer())

    if (buffer.length === 0) {
        throw new Error('[R2 CLEAN CACHE] Downloaded file is empty')
    }

    await mkdir(path.dirname(outputPath), {recursive: true})
    await writeFile(outputPath, buffer)

    console.log('[R2 CLEAN CACHE DOWNLOADED]', {
        outputPath,
        sizeBytes: buffer.length
    })
}

export const prepareReel = async (
    keyTrailer: string,
    hook: string,
    ctx: any | undefined,
    content: {
        id: number
        type: string
        genre?: string | Array<{
            id?: number
            name?: string
        } | string>
        rating?: number | string
        subtitlesPath?: string
        highlightWord?: string
    },
    mode: 'publish' | 'download'
) => {
    if (!keyTrailer) {
        throw new Error('Trailer key is missing')
    }

    if (mode === 'download' && !ctx) {
        throw new Error('Telegram context is missing for download mode')
    }

    const sourceR2Path = `instagram/reels/temp/${content.id}_${content.type}_${keyTrailer}.mp4`
    const reelR2Path = `instagram/reels/reel/${content.id}_${content.type}_${keyTrailer}_reel.mp4`
    const cleanR2Path = `instagram/reels/clean/${content.id}_${content.type}_${keyTrailer}_clean.mp4`

    let sourcePath: string | undefined
    let normalizePath: string | undefined
    let preparedInstagramPath: string | undefined
    let reelPath: string | undefined

    let telegramFileId: string | undefined
    let sourceR2CleanupNeeded = false
    let completed = false

    try {
        const cacheExist = await runReelStep(
            'CHECK_REEL_CACHE',
            () => existsInCloudflareR2(reelR2Path)
        )

        // Готовый Reel уже есть. В download-режиме дополнительно отправляем
        // пользователю исходный полный трейлер, как и раньше.
        if (cacheExist) {
            if (mode === 'download') {
                sourcePath = await runReelStep(
                    'DOWNLOAD_TRAILER_FOR_TELEGRAM',
                    () => downloadTrailer(keyTrailer)
                )

                telegramFileId = await runReelStep(
                    'SEND_TRAILER_TO_TELEGRAM',
                    () => telegramSendVideo(ctx, sourcePath!)
                )
            }

            completed = true

            return {
                telegramFileId,
                reelR2: getCloudflareR2Url(reelR2Path)
            }
        }

        const cleanCacheExists = await runReelStep(
            'CHECK_CLEAN_VIDEO_CACHE',
            () => existsInCloudflareR2(cleanR2Path)
        )

        if (cleanCacheExists) {
            console.log('[REEL CLEAN CACHE HIT]', cleanR2Path)

            // В download-режиме Telegram по-прежнему получает полный трейлер.
            if (mode === 'download') {
                sourcePath = await runReelStep(
                    'DOWNLOAD_TRAILER_FOR_TELEGRAM',
                    () => downloadTrailer(keyTrailer)
                )

                normalizePath = await runReelStep(
                    'NORMALIZE_FULL_TRAILER',
                    () => normalizeTrailer(sourcePath!, keyTrailer)
                )

                telegramFileId = await runReelStep(
                    'SEND_TRAILER_TO_TELEGRAM',
                    () => telegramSendVideo(ctx, normalizePath!)
                )
            }

            // Восстанавливаем промежуточный clean локально и выполняем только
            // decorate + загрузку финального Reel. UUID предотвращает коллизии.
            preparedInstagramPath = path.join(
                os.tmpdir(),
                'instagram',
                'reels',
                'clean',
                `${content.id}_${content.type}_${keyTrailer}_clean_cache_${randomUUID()}.mp4`
            )

            await runReelStep(
                'DOWNLOAD_CLEAN_VIDEO_FROM_R2',
                () => downloadR2ObjectToFile(
                    getCloudflareR2Url(cleanR2Path),
                    preparedInstagramPath!
                )
            )

        } else {
            // Кэш clean отсутствует — загружаем полный исходник.
            sourcePath = await runReelStep(
                'DOWNLOAD_TRAILER',
                () => downloadTrailer(keyTrailer)
            )

            sourceR2CleanupNeeded = true

            await runReelStep(
                'UPLOAD_SOURCE_TO_R2',
                () => storageCloudflareR2(sourcePath!, sourceR2Path)
            )

            if (mode === 'download') {
                // Нормализуем полный трейлер только для Telegram.
                // Для Instagram берём исходник и выбираем сегмент внутри
                // prepareInstagramVideo, не обрезая первые 40 секунд заранее.
                normalizePath = await runReelStep(
                    'NORMALIZE_FULL_TRAILER',
                    () => normalizeTrailer(sourcePath!, keyTrailer)
                )

                telegramFileId = await runReelStep(
                    'SEND_TRAILER_TO_TELEGRAM',
                    () => telegramSendVideo(ctx, normalizePath!)
                )
            }

            // Критично: передаём ПОЛНЫЙ трейлер. Нарезка по времени и
            // композиция clean выполняются одним FFmpeg-проходом внутри prepare.
            preparedInstagramPath = await runReelStep(
                'PREPARE_INSTAGRAM_VIDEO',
                () => prepareInstagramVideo(sourcePath!, keyTrailer)
            )

            await runReelStep(
                'UPLOAD_CLEAN_VIDEO_TO_R2',
                () => storageCloudflareR2(
                    preparedInstagramPath!,
                    cleanR2Path
                )
            )
        }

        reelPath = await runReelStep(
            'DECORATE_INSTAGRAM_VIDEO',
            () => decorateInstagramVideo(
                preparedInstagramPath!,
                keyTrailer,
                hook,
                {
                    genre: content.genre,
                    rating: content.rating,
                    subtitlesPath: content.subtitlesPath,
                    highlightWord: content.highlightWord
                }
            )
        )

        const reelR2 = await runReelStep(
            'UPLOAD_FINAL_REEL_TO_R2',
            () => storageCloudflareR2(reelPath!, reelR2Path)
        )

        completed = true

        return {
            telegramFileId,
            reelR2
        }

    } finally {
        if (sourceR2CleanupNeeded) {
            try {
                await deleteFromCloudflareR2(sourceR2Path)
                console.log('[R2 SOURCE DELETED]', sourceR2Path)
            } catch (error) {
                console.error('[R2 SOURCE DELETE ERROR]', error)
            }
        }

        const temporaryFiles = [
            sourcePath,
            normalizePath,
            preparedInstagramPath,
            reelPath
        ]

        for (const filePath of new Set(temporaryFiles)) {
            if (!filePath) {
                continue
            }

            try {
                await unlink(filePath)
                console.log('[LOCAL TEMP DELETE]', filePath)
            } catch (error: any) {
                if (error?.code !== 'ENOENT') {
                    console.error('[LOCAL TEMP DELETE ERROR]', filePath, error)
                }
            }
        }

        // Сообщение об окончании отправляем только после успешного завершения.
        if (mode === 'download' && completed && ctx) {
            try {
                await ctx.reply('процесс окончен')
            } catch (error) {
                console.error('[DOWNLOAD COMPLETE MESSAGE ERROR]', error)
            }
        }
    }
}
