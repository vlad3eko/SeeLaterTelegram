import {NOTIFICATION_MESSAGE} from "#server/global/notifications/sendNotificationMessage";
import {getAdminEditSession} from "#server/bot/actions/admin/adminEditSession";
import {adminEditActionInlineMessage} from "#server/bot/actions/admin/adminEditActionInlineMessage";

export const adminEditTypeCard = async (ctx: any) => {

    const session =
        getAdminEditSession(ctx.from.id)


    if (!session) {
        await ctx.answerCbQuery(NOTIFICATION_MESSAGE.CbQ.ErrorProcessSession)
        return
    }

    session.mode = 'type'
    session.isRichTypeCard = !session.isRichTypeCard
    await ctx.answerCbQuery(NOTIFICATION_MESSAGE.CbQ.SuccessProcessEditType)

    return adminEditActionInlineMessage(ctx, session)
}
