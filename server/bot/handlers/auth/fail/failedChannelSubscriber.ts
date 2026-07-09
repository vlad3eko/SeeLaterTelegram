import {Markup} from "telegraf";
import {addMessageSession} from "#server/bot/services/session/addMessageSession";
import {SessionMessageType} from "#server/bot/consts/types/SessionMessageTypes";

export const failedChannelSubscriber = async (ctx: any) => {

   const message = await ctx.reply(
        '❌ Подпишитесь на канал \nпосле чего нажмите (Проверить подписку)',
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
        SessionMessageType.Error, {
            messageId: message.message_id
        }
    )
}
