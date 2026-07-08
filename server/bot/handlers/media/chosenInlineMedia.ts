import { SessionMessageType } from "#server/bot/consts/types/SessionMessageTypes";
import { addInlineMessageSession } from "#server/bot/services/session/addInlineMessageSession";

export const chosenInlineMedia = async (ctx: any) => {

    console.log("========== CHOSEN INLINE ==========")
    console.dir(ctx.update, { depth: null })

    const result = ctx.chosenInlineResult

    console.log("RESULT:", result)

    if (!result?.inline_message_id) {
        console.log("NO INLINE MESSAGE ID")
        return
    }

    console.log("INLINE ID:", result.inline_message_id)

    await addInlineMessageSession(
        ctx.from.id,
        result.inline_message_id,
        SessionMessageType.InlineMediaCard
    )

    console.log("SESSION SAVED")
}
