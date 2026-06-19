import {Markup} from "telegraf";

export const failedChannelSubscriber = async (ctx: any) => {
    await ctx.reply(
        '❌ Подпишитесь на канал',
        Markup.inlineKeyboard([
            Markup.button.url(
                'Подписаться',
                'https://t.me/Zerno_Kopeica'
            ),
            Markup.button.callback(
                'Проверить подписку',
                'check_sub'
            )
        ])
    )
}
