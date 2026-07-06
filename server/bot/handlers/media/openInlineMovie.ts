import {sendMediaCard} from "#server/bot/consts/media/sendMediaCard";
import {deleteMessages} from "#server/bot/actions/delete/deleteMessages";
import {addMessageSession} from "#server/bot/services/session/addMessageSession";

export const openInlineMovie = async (ctx: any) => {

    const mediaTrigger = ctx.message.text
    await ctx.deleteMessage()
    await addMessageSession(ctx.from.id, mediaTrigger.message_id)

    const [, id, mediaType] =
        ctx.message.text.split("_")

    await sendMediaCard(ctx, id, mediaType)
}
