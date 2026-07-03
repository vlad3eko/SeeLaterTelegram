export async function help(ctx: any) {
    await ctx.reply(
        `📖 Доступные команды:

        /start — открыть меню
        /help — помощь
        /profile — профиль
        `)
}
