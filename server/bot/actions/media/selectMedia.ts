import {sendMediaCard} from "#server/bot/consts/media/sendMediaCard";
import {addMediaState} from "#server/bot/consts/media/addMediaState";
import {deleteMessages} from "#server/bot/actions/delete/deleteMessages";

export const selectMedia = async (ctx: any) => {

    await ctx.answerCbQuery()
    const state = addMediaState.get(ctx.from.id)
    if (!state?.waitingMovie) {
        await deleteMessages(ctx, [-1])
    }

    const mediaId = Number(ctx.match[1])
    const mediaType = String(ctx.match[2])

 await sendMediaCard(ctx, mediaId, mediaType)
}
