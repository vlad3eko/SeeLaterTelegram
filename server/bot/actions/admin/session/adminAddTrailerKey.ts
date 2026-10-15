import {getAdminEditSession, updateAdminEditSession} from "#server/bot/actions/admin/adminEditSession"

import {NOTIFICATION_MESSAGE} from "#server/global/notifications/sendNotificationMessage"
import {addMessageSession} from "#server/bot/services/session/addMessageSession";
import {SessionMessageType} from "#server/bot/consts/types/SessionMessageTypes";

export const adminAddTrailerKey = async (ctx: any) => {

    const session = await getAdminEditSession(ctx.from.id)

    if (!session) {
        await ctx.answerCbQuery(NOTIFICATION_MESSAGE.CbQ.ErrorProcessSession)
        return
    }

    try {
        await updateAdminEditSession(ctx.from.id, {mode: 'trailer'})
    } catch (error) {
        console.error('[UPDATE TRAILER MODE ERROR]', error)

        await ctx.answerCbQuery(NOTIFICATION_MESSAGE.CbQ.ErrorTrailerSession)
        return
    }

    await ctx.answerCbQuery(NOTIFICATION_MESSAGE.CbQ.SendNewTrailerKey)

    try {
        const message = await ctx.telegram.sendMessage(ctx.from.id, NOTIFICATION_MESSAGE.reply.SendNewTrailer)
        await addMessageSession(ctx.from.id, SessionMessageType.Text, {messageId: message.message_id}
        )
    } catch (error) {
        console.error('[TRAILER KEY PROMPT ERROR]', error)
    }
}
