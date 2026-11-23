import {getSupabase} from '#server/global/engine/instagram/reel/jobs/dispatchReelJob'
import {saveTitleForUser, userByTelegramId} from '#server/global/engine/instagram/comments/save'
import {NOTIFICATION_MESSAGE, sendNotificationTelegramMessage} from '#server/global/notifications/sendNotificationMessage'
import {internalFetch} from '#server/utils/api/internalFetch'
import {parseMediaAction} from '#server/bot/handlers/channel/actionPayload'

/**
 * /start save_<тип>_<id> и unsave_<тип>_<id>: «Сохранить»/«Удалить», нажатые без подписки или до
 * запуска бота (кнопка открыла бота ссылкой, либо действие выполнено после подписки). Сообщение — как
 * у кнопки: «успешно добавлено в вашу коллекцию» с кнопкой коллекции.
 */
export const startMediaAction = async (ctx: any, payload: string) => {
    const parsed = parseMediaAction(payload)
    if (!parsed) return
    const telegramId = ctx.from.id

    if (parsed.action === 'unsave') {
        const {success} = await internalFetch<{success: boolean}>('/api/bot/deleteMediaBot', {
            method: 'POST', body: {telegram_id: telegramId, tmdb_id: parsed.mediaId, media_type: parsed.mediaType}
        })
        await ctx.reply(success ? NOTIFICATION_MESSAGE.CbQ.SuccessDelete : NOTIFICATION_MESSAGE.CbQ.ErrorDoesNotExist)
        return
    }

    const supabase = getSupabase() as any
    const user = await userByTelegramId(supabase, telegramId)
    if (!user) throw new Error('пользователь не найден после saveTelegramUser')
    const outcome = await saveTitleForUser(supabase, {userId: user.id, mediaId: parsed.mediaId, mediaType: parsed.mediaType})
    if (outcome === 'saved') {
        await sendNotificationTelegramMessage(telegramId, NOTIFICATION_MESSAGE.SuccessSaved, {mediaId: parsed.mediaId, mediaType: parsed.mediaType})
    } else {
        await ctx.reply(parsed.mediaType === 'tv' ? '✅ Уже в вашей коллекции — напомним о новых сериях.' : '✅ Уже в вашей коллекции — напомним, когда выйдет.')
    }
}
