import {trimVideo} from "./utils/trimVideo"
import {
    deleteFromCloudflareR2, existsInCloudflareR2, getCloudflareR2Url,
    storageCloudflareR2
} from "./utils/storageCloudflareR2"
import {normalizeTrailer} from "#server/global/engine/instagram/reel/utils/normalizeTrailer"
import {telegramSendVideo} from "#server/global/engine/instagram/reel/utils/telegramSendVideo"
import {downloadTrailer} from "#server/global/engine/instagram/reel/utils/downloadTrailer"

import {unlink} from 'node:fs/promises'
import {prepareInstagramVideo} from "#server/global/engine/instagram/reel/utils/createInstagramVideo";
import {decorateInstagramVideo} from "#server/global/engine/instagram/reel/utils/decorateInstagramVideo";

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

    const sourceR2Path = `instagram/reels/temp/${content.id}_${content.type}_${keyTrailer}.mp4`
    const reelR2Path = `instagram/reels/reel/${content.id}_${content.type}_${keyTrailer}_reel.mp4`
    const cleanR2Path = `instagram/reels/clean/${content.id}_${content.type}_${keyTrailer}_clean.mp4`

    let sourcePath: string | undefined
    let normalizePath: string | undefined
    let trimmedPath: string | undefined
    let preparedInstagramPath: string | undefined

    let telegramFileId: string | undefined
    let sourceUploadedToR2 = false
    let reelPath: string | undefined

    try {

        if (mode === 'download') {

            sourcePath = await downloadTrailer(keyTrailer)
            normalizePath = await normalizeTrailer(sourcePath, keyTrailer)
            telegramFileId = await telegramSendVideo(ctx, normalizePath)

            await ctx.reply('скачан, нормализован, отправлен')

            return {
                telegramFileId
            }
        }

        const cacheExist =
            await existsInCloudflareR2(reelR2Path)

        if (cacheExist) {

            return {
                reelR2: getCloudflareR2Url(reelR2Path)
            }
        }

        sourcePath =
            await downloadTrailer(keyTrailer)
            await storageCloudflareR2(sourcePath, sourceR2Path)
            sourceUploadedToR2 = true

        normalizePath =
            await normalizeTrailer(sourcePath, keyTrailer)

        trimmedPath =
            await trimVideo(normalizePath, keyTrailer)

        preparedInstagramPath =
            await prepareInstagramVideo(trimmedPath, keyTrailer)
            await storageCloudflareR2(preparedInstagramPath, cleanR2Path)

        reelPath =
            await decorateInstagramVideo(preparedInstagramPath, keyTrailer, hook)

        const reelR2 =
            await storageCloudflareR2(reelPath, reelR2Path)

        return {
            telegramFileId,
            reelR2
        }

    } finally {

        if (sourceUploadedToR2) {
            try {

                await deleteFromCloudflareR2(
                    sourceR2Path
                )

            } catch (error) {

                console.error(
                    '[R2 SOURCE DELETE ERROR]',
                    error
                )
            }
        }

        const temporaryFiles = [
            sourcePath,
            normalizePath,
            trimmedPath,
            preparedInstagramPath,
            reelPath
        ]

        for (const filePath of temporaryFiles) {

            if (!filePath) {
                continue
            }

            try {

                await unlink(filePath)

                console.log(
                    '[LOCAL TEMP DELETE]',
                    filePath
                )

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
    }
}
