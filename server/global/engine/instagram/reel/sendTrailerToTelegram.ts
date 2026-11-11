import {unlink} from "node:fs/promises"
import {downloadTrailer} from "#server/global/engine/instagram/reel/utils/downloadTrailer"
import {isYouTubeVideoId} from "#server/global/engine/instagram/reel/utils/extractYouTubeVideoId"
import {telegramSendVideo} from "#server/global/engine/instagram/reel/utils/telegramSendVideo"

/**
 * Режим «download» админ-бота: скачать трейлер и прислать его в чат. Больше ничего.
 *
 * Здесь нет чистого видео, Reel, субтитров, Gemini и R2: Reel собирает воркер при публикации.
 * Поэтому функция укладывается в лимит Vercel с запасом: загрузка yt-dlp (не выше 1080p, H.264 + AAC,
 * без перекодирования) и отправка файла. Перекодирование включается, только если файл больше лимита
 * Telegram (его делает telegramSendVideo).
 *
 * Возвращает file_id отправленного видео.
 */
export const sendTrailerToTelegram = async (
    keyTrailer: string,
    ctx: any
): Promise<string> => {
    if (!keyTrailer) {
        throw new Error('Trailer key is missing')
    }

    if (!isYouTubeVideoId(keyTrailer)) {
        throw new Error('Trailer key is not a valid YouTube video id')
    }

    if (!ctx) {
        throw new Error('Telegram context is missing')
    }

    let trailerPath: string | undefined

    try {
        const downloadStartedAt = Date.now()

        console.log('[TRAILER DOWNLOAD START]', {keyTrailer})

        trailerPath = await downloadTrailer(keyTrailer, {forTelegram: true})

        console.log('[TRAILER DOWNLOAD DONE]', {
            keyTrailer,
            durationMs: Date.now() - downloadStartedAt
        })

        const telegramFileId = await telegramSendVideo(ctx, trailerPath)

        console.log('[TRAILER SENT TO TELEGRAM]', {
            keyTrailer,
            durationMs: Date.now() - downloadStartedAt
        })

        try {
            await ctx.reply('процесс окончен')
        } catch (error) {
            console.error('[DOWNLOAD COMPLETE MESSAGE ERROR]', error)
        }

        return telegramFileId

    } finally {
        if (trailerPath) {
            try {
                await unlink(trailerPath)

                console.log('[LOCAL TEMP DELETE]', trailerPath)
            } catch (error: any) {
                if (error?.code !== 'ENOENT') {
                    console.error('[LOCAL TEMP DELETE ERROR]', trailerPath, error)
                }
            }
        }
    }
}
