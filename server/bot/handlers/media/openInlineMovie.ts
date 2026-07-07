import {sendMediaCard} from "#server/bot/consts/media/sendMediaCard";
import {deleteMessages} from "#server/bot/actions/delete/deleteMessages";
import {addMessageSession} from "#server/bot/services/session/addMessageSession";
import {SessionMessageType} from "#server/bot/consts/types/SessionMessageTypes";

export const openInlineMovie = async (ctx: any) => {

    const mediaTrigger = ctx.message.text
    await addMessageSession(ctx.from.id, mediaTrigger.message_id, SessionMessageType.Text)

    const [, id, mediaType] =
        ctx.message.text.split("_")

    await sendMediaCard(ctx, id, mediaType)
}
