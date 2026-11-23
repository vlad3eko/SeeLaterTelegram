
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
            tmdb_id: mediaId,
            media_type: mediaType
        }
    })

    // На нажатие отвечают один раз: второй answerCbQuery Telegram отвергает.
    if (!success)
        return ctx.answerCbQuery(NOTIFICATION_MESSAGE.CbQ.ErrorDoesNotExist).catch(() => undefined)

    await ctx.answerCbQuery(NOTIFICATION_MESSAGE.CbQ.SuccessDelete).catch(() => undefined)

}
