import {normalizeTrailer} from "#server/global/engine/instagram/reel/utils/normalizeTrailer"
import {telegramSendVideo} from "#server/global/engine/instagram/reel/utils/telegramSendVideo"
import {downloadTrailer} from "#server/global/engine/instagram/reel/utils/downloadTrailer"
import {unlink} from "node:fs/promises"
import {prepareInstagramVideo} from "#server/global/engine/instagram/reel/utils/prepareInstagramVideo"
import {decorateInstagramVideo} from "#server/global/engine/instagram/reel/utils/decorateInstagramVideo"
import {deleteFromCloudflareR2, existsInCloudflareR2, getCloudflareR2Url, storageCloudflareR2} from "#server/global/engine/instagram/reel/utils/storageCloudflareR2";
import {trimVideo} from "#server/global/engine/instagram/reel/utils/trimVideo";

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

export const prepareReel = async (
    keyTrailer: string,
    hook: string,
    ctx: any | undefined,
    content: {id: number, type: string},
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
    let trimmedPath: string | undefined
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

        // Готовый Reel уже есть в R2.
        // Для download всё ещё отправляем исходный трейлер в Telegram.
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

        sourcePath = await runReelStep(
            'DOWNLOAD_TRAILER',
            () => downloadTrailer(keyTrailer)
        )

        // Загружаем исходник во временное хранилище.
        sourceR2CleanupNeeded = true

        await runReelStep(
            'UPLOAD_SOURCE_TO_R2',
            () => storageCloudflareR2(sourcePath!, sourceR2Path)
        )

        let instagramInputPath: string

        if (mode === 'download') {
            // Сохраняем прежнее поведение:
            // пользователю отправляется полный нормализованный трейлер.
            normalizePath = await runReelStep(
                'NORMALIZE_FULL_TRAILER',
                () => normalizeTrailer(sourcePath!, keyTrailer)
            )

            telegramFileId = await runReelStep(
                'SEND_TRAILER_TO_TELEGRAM',
                () => telegramSendVideo(ctx, normalizePath!)
            )

            // Для Reel нам по-прежнему нужны только первые 40 секунд.
            trimmedPath = await runReelStep(
                'TRIM_NORMALIZED_TRAILER',
                () => trimVideo(normalizePath!, keyTrailer)
            )

            instagramInputPath = trimmedPath

        } else {
            // Главный фикс:
            // сначала вырезаем 40 секунд без перекодирования,
            // а уже потом нормализуем короткий фрагмент.
            trimmedPath = await runReelStep(
                'TRIM_SOURCE_BEFORE_NORMALIZE',
                () => trimVideo(sourcePath!, keyTrailer)
            )

            normalizePath = await runReelStep(
                'NORMALIZE_40_SECOND_CLIP',
                () => normalizeTrailer(trimmedPath!, keyTrailer)
            )

            instagramInputPath = normalizePath
        }

        preparedInstagramPath = await runReelStep(
            'PREPARE_INSTAGRAM_VIDEO',
            () => prepareInstagramVideo(instagramInputPath, keyTrailer)
        )

        await runReelStep(
            'UPLOAD_CLEAN_VIDEO_TO_R2',
            () => storageCloudflareR2(preparedInstagramPath!, cleanR2Path)
        )

        reelPath = await runReelStep(
            'DECORATE_INSTAGRAM_VIDEO',
            () => decorateInstagramVideo(
                preparedInstagramPath!,
                keyTrailer,
                hook
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
            trimmedPath,
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
                    console.error(
                        '[LOCAL TEMP DELETE ERROR]',
                        filePath,
                        error
                    )
                }
            }
        }

        // Не сообщаем об успешном завершении, если подготовка упала.
        if (mode === 'download' && completed && ctx) {
            try {
                await ctx.reply('процесс окончен')
            } catch (error) {
                console.error('[DOWNLOAD COMPLETE MESSAGE ERROR]', error)
            }
        }
    }
}
