import {trimVideo} from "./reel/utils/trimVideo"
import {
    deleteFromCloudflareR2, existsInCloudflareR2, getCloudflareR2Url,
    storageCloudflareR2
} from "./storageCloudflareR2"
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

    try {

        const cacheExist =
           await existsInCloudflareR2(reelR2Path)

        if (cacheExist) {
            sourcePath =
                await downloadTrailer(keyTrailer)
                await storageCloudflareR2(sourcePath, sourceR2Path)

            if (mode === 'download')
                telegramFileId = await telegramSendVideo(ctx, sourcePath)

            return {
                telegramFileId,
                reelR2: getCloudflareR2Url(reelR2Path)
            }
        }

        sourcePath =
            await downloadTrailer(keyTrailer)
            await storageCloudflareR2(sourcePath, sourceR2Path)

        normalizePath =
            await normalizeTrailer(sourcePath, keyTrailer)

        if (mode === 'download')
            telegramFileId = await telegramSendVideo(ctx, normalizePath)

        trimmedPath =
            await trimVideo(normalizePath, keyTrailer)

        preparedInstagramPath =
            await prepareInstagramVideo(trimmedPath, keyTrailer)
            await storageCloudflareR2(preparedInstagramPath, cleanR2Path)

        const reelPath =
            await decorateInstagramVideo(preparedInstagramPath, keyTrailer, hook)

        const reelR2 =
            await storageCloudflareR2(reelPath, reelR2Path)

        return {
            telegramFileId,
            reelR2
        }

    } finally {
        try {
            await deleteFromCloudflareR2(sourceR2Path)

        } catch (error) {
            console.error('[R2 SOURCE DELETE ERROR]', error)
        }

        const temporaryFiles = [
            sourcePath,
            normalizePath,
            trimmedPath,
            preparedInstagramPath,
        ]

        for (const filePath of temporaryFiles) {

            if (!filePath) {
                continue
            }

            try {

                await unlink(filePath)

                console.log('[LOCAL TEMP DELETE]', filePath)

            } catch (error: any) {

                if (error?.code !== 'ENOENT')
                    console.error('[LOCAL TEMP DELETE ERROR]', filePath, error)
            }
        }

        if (mode === 'download')
            await ctx.reply('процесс окончен')
    }
}
