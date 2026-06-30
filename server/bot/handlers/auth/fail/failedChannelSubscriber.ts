import {Markup} from "telegraf";
import {processTelegramAuth} from "#server/bot/services/auth/processTelegramAuth";

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

    await processTelegramAuth(ctx, authRequests)
}
