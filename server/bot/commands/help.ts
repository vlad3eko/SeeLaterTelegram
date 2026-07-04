import {addSessionMessage} from "#server/bot/services/session/addSessionMessage";

export async function help(ctx: any) {

    await ctx.deleteMessage()

    const message = await ctx.reply(
        `📖 Доступные команды:

        /start — открыть меню
        /help — помощь
        /profile — профиль
        `)
    await addSessionMessage(
        ctx.from.id,
        message.message_id
    )
}
