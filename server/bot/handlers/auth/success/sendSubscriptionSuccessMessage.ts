import {addSessionMessage} from "#server/bot/services/session/addSessionMessage";

export const sendSubscriptionSuccessMessage = async (ctx: any) => {

    await ctx.deleteMessage()
    const message = await ctx.reply(
        '✅ Подписка подтверждена \n Спасибо за поддержку проекта!', {
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
    await addSessionMessage(ctx.from.id, message.message_id)
}
