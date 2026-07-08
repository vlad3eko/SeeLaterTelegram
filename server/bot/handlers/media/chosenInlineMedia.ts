import {addInlineMessageSession} from "#server/bot/services/session/addInlineMessageSession";
import {SessionMessageType} from "#server/bot/consts/types/SessionMessageTypes";


export const chosenInlineMedia = async(ctx:any)=>{


    const inlineMessageId =
        ctx.chosenInlineResult.inline_message_id


    await addInlineMessageSession(
        ctx.from.id,
        inlineMessageId,
        SessionMessageType.InlineMediaCard
    )

}
