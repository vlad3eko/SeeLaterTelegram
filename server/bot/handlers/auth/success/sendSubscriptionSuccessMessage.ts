export const sendSubscriptionSuccessMessage = async (ctx: any, authRequests: Map<string, number>) => {

    await ctx.deleteMessage()

    await ctx.reply(
        '✅ Подписка подтверждена \n Спасибо за поддержку проекта!',
    )
}
