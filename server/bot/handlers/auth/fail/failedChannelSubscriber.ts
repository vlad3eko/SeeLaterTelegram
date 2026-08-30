import {Markup} from "telegraf";
import {addMessageSession} from "#server/bot/services/session/addMessageSession";
import {SessionMessageType} from "#server/bot/consts/types/SessionMessageTypes";
import {telegramChannelShortLink} from "#server/global/oneLinkApp";

export const failedChannelSubscriber = async (ctx: any) => {

   const message = await ctx.reply(
        '❌ Подпишитесь на канал \nпосле чего нажмите (Проверить подписку) \n\n Это не реклама! Официальный канал бота. \n\nВ канале публикуются только новинки Кино/Сериалов',
        Markup.inlineKeyboard([
            Markup.button.url(
                'Подписаться',
                telegramChannelShortLink
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
