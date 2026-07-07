import {addMessageSession} from "#server/bot/services/session/addMessageSession";
import {SessionMessageType} from "#server/bot/consts/types/SessionMessageTypes";

export async function help(ctx: any) {

    await ctx.deleteMessage()

    const message = await ctx.reply(
        `📖 Доступные команды:

        /start — открыть меню
        /help — помощь
        /profile — профиль
        `)
    await addMessageSession(
        ctx.from.id,
        message.message_id,
        SessionMessageType.Command
    )
}
