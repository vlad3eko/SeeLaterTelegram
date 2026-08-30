import {checkChannelSubscriber} from "#server/bot/handlers/auth/check/checkChannelSubscriber";
import {createMediaCaption} from "#server/bot/consts/media/createMediaCaption";
import {NOTIFICATION_MESSAGE} from "#server/global/notifications/sendNotificationMessage";

export const deleteMedia = async (ctx: any) => {

    const isUserBot = await checkChannelSubscriber(ctx)

    if (!isUserBot)
        await ctx.answerCbQuery(NOTIFICATION_MESSAGE.CbQ.ErrorOnlyForSubscriber)

    const telegramId = ctx.from.id
    const mediaId = Number(ctx.match[1])

    const {success} = await $fetch<{
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
