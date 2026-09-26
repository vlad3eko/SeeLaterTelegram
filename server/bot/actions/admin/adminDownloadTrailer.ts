import {NOTIFICATION_MESSAGE} from "#server/global/notifications/sendNotificationMessage";
import {getAdminEditSession} from "#server/bot/actions/admin/adminEditSession";

export const adminDownloadTrailer = async (ctx: any) => {
    const session =
        getAdminEditSession(ctx.from.id)

    if (!session) {
        await ctx.answerCbQuery(NOTIFICATION_MESSAGE.CbQ.ErrorProcessSession)
        return
    }
    session.mode = 'download'
    await ctx.answerCbQuery(NOTIFICATION_MESSAGE.CbQ.SuccessProcessDownloadTrailer)
}
