import {Input} from 'telegraf'
import {bot, BOT_LINK} from '#server/bot/bot'
import {verifyTrailerDelivery} from '#server/global/engine/instagram/reel/jobs/trailerDelivery'
import {deleteFromCloudflareR2, getCloudflareR2KeyFromUrl} from '#server/global/engine/instagram/reel/utils/storageCloudflareR2'

/**
 * Ответ воркера на «Загрузку трейлера» (jobs/trailerDelivery.ts): готовый файл во временной папке
 * R2 или ошибка. Файл уходит в чат потоком — Vercel не скачивает и не перекодирует его, — затем
 * удаляется из R2.
 */
export default defineEventHandler(async (event) => {
    const body = await readBody(event)
    const request = {
        keyTrailer: String(body?.keyTrailer ?? ''),
        chatId: Number(body?.chatId),
        expires: Number(body?.expires),
        token: body?.token
    }
    if (!BOT_LINK || !verifyTrailerDelivery(request, BOT_LINK)) {
        throw createError({statusCode: 401, message: 'Invalid trailer delivery token'})
    }

    const videoUrl = typeof body?.videoUrl === 'string' ? body.videoUrl : ''
    const key = videoUrl ? getCloudflareR2KeyFromUrl(videoUrl) : ''
    if (!key.startsWith('instagram/reels/temp/trailer_')) {
        console.error('[TRAILER DELIVERY FAILED]', {keyTrailer: request.keyTrailer, error: body?.error ?? 'no video'})
        await bot.telegram.sendMessage(request.chatId, 'Не удалось скачать трейлер')
        return {success: false}
    }

    // Файл удаляется в любом случае, поэтому ошибка отправки не отдаётся воркеру на повтор.
    try {
        await bot.telegram.sendVideo(request.chatId, Input.fromURLStream(videoUrl, 'trailer.mp4'), {supports_streaming: true})
        await bot.telegram.sendMessage(request.chatId, 'процесс окончен')
        return {success: true}
    } catch (error) {
        console.error('[TRAILER DELIVERY SEND ERROR]', {keyTrailer: request.keyTrailer, error})
        await bot.telegram.sendMessage(request.chatId, 'Не удалось отправить трейлер').catch(() => undefined)
        return {success: false}
    } finally {
        await deleteFromCloudflareR2(key).catch(error => console.error('[TRAILER DELIVERY R2 DELETE ERROR]', {key, error}))
    }
})
