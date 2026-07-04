import {Markup} from "telegraf";
import {addMessageSession} from "#server/bot/services/session/addMessageSession";

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

    await addMessageSession(
        ctx.from.id,
        message.message_id
    )
}
