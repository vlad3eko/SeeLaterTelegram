import {processMediaSearch} from "#server/bot/services/addMedia/processMediaSearch";

export const sendSubscriptionSuccessMessage = async (ctx: any, authRequests: Map<string, number>) => {

    await ctx.answerCbQuery()
    await ctx.deleteMessage()

    await ctx.reply(
        '✅ Подписка подтверждена \n Спасибо за поддержку проекта!',
    )

    await processMediaSearch(ctx, authRequests)
}
