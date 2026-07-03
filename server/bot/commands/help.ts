export async function help(ctx: any) {

    await ctx.deleteMessage()

    await ctx.reply(
        `📖 Доступные команды:

        /start — открыть меню
        /help — помощь
        /profile — профиль
        `)
}
