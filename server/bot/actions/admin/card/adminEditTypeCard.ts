
import {NOTIFICATION_MESSAGE} from "#server/global/notifications/sendNotificationMessage";
import {getAdminEditSession, updateAdminEditSession} from "#server/bot/actions/admin/adminEditSession";
import {adminEditActionInlineMessage} from "#server/bot/actions/admin/adminEditActionInlineMessage";

export const adminEditTypeCard = async (ctx: any) => {

    const session =
       await getAdminEditSession(ctx.from.id)

    if (!session) {
        await ctx.answerCbQuery(NOTIFICATION_MESSAGE.CbQ.ErrorProcessSession)
        return
    }

    await updateAdminEditSession(ctx.from.id, {mode: 'type'})
    await ctx.answerCbQuery(NOTIFICATION_MESSAGE.CbQ.SuccessProcessEditType)

    return adminEditActionInlineMessage(ctx, session)
}
