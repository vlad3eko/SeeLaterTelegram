
import {DELETE_MEDIA} from "#server/bot/callbacks/routes";
import {checkChannelSubscriber} from "#server/bot/handlers/auth/check/checkChannelSubscriber";
import {NOTIFICATION_MESSAGE} from "#server/global/notifications/sendNotificationMessage";
import {internalFetch} from "#server/utils/api/internalFetch";

export const deleteMedia = async (ctx: any) => {

    const isUserBot = await checkChannelSubscriber(ctx)

    if (!isUserBot)
        await ctx.answerCbQuery(NOTIFICATION_MESSAGE.CbQ.ErrorOnlyForSubscriber)

    const telegramId = ctx.from.id
    const {mediaId} = DELETE_MEDIA.parse(ctx)

    const {success} = await internalFetch<{
        success: boolean
        error: any
    }>('/api/bot/deleteMediaBot', {
        method: 'POST',
        body: {
            telegram_id: telegramId,
            tmdb_id: mediaId
        }
    })

    if (!success)
        await ctx.answerCbQuery(NOTIFICATION_MESSAGE.CbQ.ErrorDoesNotExist)

    await ctx.answerCbQuery(NOTIFICATION_MESSAGE.CbQ.SuccessDelete)

}
