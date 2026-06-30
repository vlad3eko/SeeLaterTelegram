import {Markup} from "telegraf";
import {processTelegramAuth} from "#server/bot/services/auth/processTelegramAuth";

export const failedChannelSubscriber = async (ctx: any, authRequests: Map<string, number>) => {

    await ctx.answerCbQuery()
    await ctx.deleteMessage()

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

}
