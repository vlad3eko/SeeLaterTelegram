import {addMessageSession} from "#server/bot/services/session/addMessageSession";
import {SessionMessageType} from "#server/bot/consts/types/SessionMessageTypes";

export const sendSubscriptionSuccessMessage = async (ctx: any) => {

    await ctx.deleteMessage()
    const message = await ctx.reply('✅ Спасибо, можете вернуться на сайт.')
    await addMessageSession(ctx.from.id, message.message_id, SessionMessageType.Auth)
}
