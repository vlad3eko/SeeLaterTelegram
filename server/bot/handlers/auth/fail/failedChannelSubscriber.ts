import {Markup} from "telegraf";

export const failedChannelSubscriber = async (ctx: any, authRequests: Map<string, number>) => {

    await ctx.reply(
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

        await ctx.deleteMessage()
}
