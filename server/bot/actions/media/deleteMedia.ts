
import {DELETE_MEDIA} from "#server/bot/callbacks/routes";
import {gateCallback, mediaActionPayload} from "#server/bot/handlers/channel/pendingActions";
import {NOTIFICATION_MESSAGE} from "#server/global/notifications/sendNotificationMessage";
import {internalFetch} from "#server/utils/api/internalFetch";

export const deleteMedia = async (ctx: any) => {

    const {mediaId, mediaType} = DELETE_MEDIA.parse(ctx)

    if (!(await gateCallback(ctx, mediaActionPayload('unsave', mediaType, mediaId))))
        return

    const telegramId = ctx.from.id

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
