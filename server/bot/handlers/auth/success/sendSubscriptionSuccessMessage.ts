import {Markup} from "telegraf";

export const sendSubscriptionSuccessMessage = async (ctx: any) => {
    await ctx.reply(
        '✅ Подписка подтверждена \n Спасибо за поддержку проекта!',
    )
}
