import { SessionMessageType } from "#server/bot/consts/types/SessionMessageTypes";
import { addMessageSession } from "#server/bot/services/session/addMessageSession";

export const chosenInlineMedia = async (ctx: any) => {

    const result = ctx.chosenInlineResult

    if (!result.inline_message_id) return

    await addMessageSession(
        ctx.from.id,
        SessionMessageType.InlineMediaCard,
        {
            inlineMessageId: result.inline_message_id
        }
    )

}
