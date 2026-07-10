import {SessionMessageType} from "#server/bot/consts/types/SessionMessageTypes";
import {addMessageSession} from "#server/bot/services/session/addMessageSession";

export const chosenInlineMedia = async (ctx: any) => {

    console.log('chosen results', ctx.chosenInlineResult)

    const result = ctx.chosenInlineResult
    console.log('result', result)

    const inlineMessageId =
        result.inline_message_id

    const resultId =
        result.result_id

    if(!inlineMessageId || !resultId)
        return

    const [
        type,
        id
    ] = resultId.split('_')
    console.log('type, id', type, id)

    const media = await $fetch('/api/bot/getMediaBot', {
        query: {
            id: id,
            media: type
        }
    })

    console.log('media', media)

}
