import {Markup} from "telegraf";
import {addSessionMessage} from "#server/bot/services/session/addSessionMessage";

export const failedChannelSubscriber = async (ctx: any) => {

   const message = await ctx.reply(
        '❌ Подпишитесь на канал',
        Markup.inlineKeyboard([
            Markup.button.url(
                'Подписаться',
                'https://t.me/kinomanovnet'
            ),
            Markup.button.callback(
                'Проверить подписку',
                'check_sub'
            )
        ])
    )
    await addSessionMessage(
        ctx.from.id,
        message.message_id
    )
}
