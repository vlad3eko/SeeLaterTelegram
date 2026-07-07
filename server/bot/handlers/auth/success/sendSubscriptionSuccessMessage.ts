import {addMessageSession} from "#server/bot/services/session/addMessageSession";
import {SessionMessageType} from "#server/bot/consts/types/SessionMessageTypes";

export const sendSubscriptionSuccessMessage = async (ctx: any) => {

    await ctx.deleteMessage()
    const message = await ctx.reply(
        '✅ Подписка подтверждена \n Можете вернуться на сайт.', {
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: 'меню',
                            callback_data: 'menu_bot'
                        }
                    ]
                ]
            }
        }
    )
    await addMessageSession(ctx.from.id, message.message_id, SessionMessageType.Auth)
}
