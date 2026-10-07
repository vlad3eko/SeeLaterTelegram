
import {getAdminEditSession, updateAdminEditSession} from "#server/bot/actions/admin/adminEditSession";
import {NOTIFICATION_MESSAGE} from "#server/global/notifications/sendNotificationMessage";

export const adminEditMedia = async (ctx:any) => {
    const session =
       await getAdminEditSession(ctx.from.id)

    if (!session) {
        await ctx.answerCbQuery(NOTIFICATION_MESSAGE.CbQ.ErrorProcessSession)
        return
    }

    await updateAdminEditSession(ctx.from.id, {
        mode: 'media'
    })

    session.mode = 'media'
    await ctx.answerCbQuery(NOTIFICATION_MESSAGE.CbQ.SuccessProcessEditImage)
}
