import {
    getAdminEditSession,
    updateAdminEditSession
} from "#server/bot/actions/admin/adminEditSession"

import {NOTIFICATION_MESSAGE} from "#server/global/notifications/sendNotificationMessage"

export const adminAddTrailerKey = async (ctx: any) => {
    const userId = ctx.from?.id

    if (!userId) await ctx.answerCbQuery()

    const session = await getAdminEditSession(userId)

    if (!session) {
        await ctx.answerCbQuery(NOTIFICATION_MESSAGE.CbQ.ErrorProcessSession)
        return
    }

    if (session.mode === 'publish') {
        await ctx.answerCbQuery('Дождись завершения публикации')
        return
    }

    try {
        await updateAdminEditSession(userId, {mode: 'trailer'})
    } catch (error) {
        console.error('[UPDATE TRAILER MODE ERROR]', error)

        await ctx.answerCbQuery('Не удалось включить режим изменения ключа')
        return
    }

    await ctx.answerCbQuery('Ожидаю новый ключ')

    try {
        await ctx.telegram.sendMessage(userId,
            'Отправь новую ссылку на YouTube или ID ролика.\n\n' + 'Пример ссылки: https://youtu.be/XdDomEvrZCc\n' + 'Или отправь только ID: XdDomEvrZCc')
    } catch (error) {
        console.error('[TRAILER KEY PROMPT ERROR]', error)
    }
}
