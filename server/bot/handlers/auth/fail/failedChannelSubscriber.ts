import {Markup} from "telegraf";

export const failedChannelSubscriber = async (ctx: any) => {
    await ctx.reply(
        '❌ Подпишитесь на канал',
        Markup.inlineKeyboard([
            Markup.button.url(
                'Подписаться',
                'https://t.me/bezkino_bot'
            ),
            Markup.button.callback(
                'Проверить подписку',
                'check_sub'
            )
        ])
    )
}
