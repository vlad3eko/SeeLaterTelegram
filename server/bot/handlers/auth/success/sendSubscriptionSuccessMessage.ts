export const sendSubscriptionSuccessMessage = async (ctx: any) => {

    await ctx.deleteMessage()
    await ctx.reply(
        '✅ Подписка подтверждена \n Спасибо за поддержку проекта!',
    )
}
