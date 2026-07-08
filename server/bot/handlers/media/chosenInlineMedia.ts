import { SessionMessageType } from "#server/bot/consts/types/SessionMessageTypes";
import { addInlineMessageSession } from "#server/bot/services/session/addInlineMessageSession";

export const chosenInlineMedia = async (ctx: any) => {

    console.log(ctx)
    console.dir(ctx.update, { depth: null })

    const result = ctx.chosenInlineResult
    if (!result.inline_message_id) return

    await addInlineMessageSession(
        ctx.from.id,
        result.inline_message_id,
        SessionMessageType.InlineMediaCard
    )

}
