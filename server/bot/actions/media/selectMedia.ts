import {sendMediaCard} from "#server/bot/consts/media/sendMediaCard";
import {SessionMessageType} from "#server/bot/consts/types/SessionMessageTypes";
import {addMessageSession} from "#server/bot/services/session/addMessageSession";

export const selectMedia = async (ctx: any) => {

    await ctx.answerCbQuery()

    const mediaId = Number(ctx.match[1])
    const mediaType = String(ctx.match[2])

    await sendMediaCard(ctx, mediaId, mediaType)
}
