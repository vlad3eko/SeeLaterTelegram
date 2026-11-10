import {internalFetch} from "#server/utils/api/internalFetch";

export const removeInlineMessageSession = async (
    telegramId:number,
    inlineMessageId:string
)=>{

    if(!telegramId || !inlineMessageId) return


    await internalFetch(
        '/api/bot/session/removeInlineMessageSession',
        {
            method:'POST',
            body:{
                telegram_id:telegramId,
                inline_message_id:inlineMessageId
            }
        }
    )

}
