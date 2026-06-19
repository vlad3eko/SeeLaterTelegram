import {Markup} from "telegraf";

export const sendSubscriptionSuccessMessage = async (ctx: any) => {
    await ctx.reply(
        '✅ Подписка подтверждена \n Спасибо за поддержку проекта!',
        Markup.inlineKeyboard([
            Markup.button.url(
                'Перейти на сайт',
                'https://google.com'
            )
        ])
    )
}
