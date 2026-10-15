import {getAdminEditSession, updateAdminEditSession} from "#server/bot/actions/admin/adminEditSession";
import {NOTIFICATION_MESSAGE} from "#server/global/notifications/sendNotificationMessage";

export const adminAddTrailerKey = async (ctx: any) => {
    const session = await getAdminEditSession(ctx.from.id)

    if (!session) {
        await ctx.answerCbQuery(NOTIFICATION_MESSAGE.CbQ.ErrorProcessSession)
        return
    }

    // 1. Переводим сессию в режим ожидания ключа
    await updateAdminEditSession(ctx.from.id, { mode: 'update_trailer_key' })
    await ctx.answerCbQuery()
    await ctx.reply('Отправьте ключ трейлера в формате: https://www.youtube.com/watch?v=ВАШ_КЛЮЧ (отправьте ссылку на трейлер)')
}
