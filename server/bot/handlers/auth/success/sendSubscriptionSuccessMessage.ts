import {failedLoginToken} from "#server/bot/handlers/commands/start/failedLoginToken";

export const sendSubscriptionSuccessMessage = async (ctx: any, authRequests: Map<string, number>) => {

    await ctx.answerCbQuery()
    await ctx.deleteMessage()

    await ctx.reply(
        '✅ Подписка подтверждена \n Спасибо за поддержку проекта!',
    )
    await failedLoginToken(ctx)
}
