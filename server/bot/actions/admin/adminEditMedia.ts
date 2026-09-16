
import {getAdminEditSession} from "#server/bot/actions/admin/adminEditSession";
import {NOTIFICATION_MESSAGE} from "#server/global/notifications/sendNotificationMessage";

export const adminEditMedia = async (ctx:any) => {
    const session =
        getAdminEditSession(ctx.from.id)

    if (!session) {
        await ctx.answerCbQuery(NOTIFICATION_MESSAGE.CbQ.ErrorProcessSession)
        return
    }
    session.mode = 'media'
    await ctx.answerCbQuery(NOTIFICATION_MESSAGE.CbQ.SuccessProcessEditImage)
}
