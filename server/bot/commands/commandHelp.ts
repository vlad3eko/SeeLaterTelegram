import {addMessageSession} from "#server/bot/services/session/addMessageSession";
import {SessionMessageType} from "#server/bot/consts/types/SessionMessageTypes";

export async function commandHelp(ctx: any) {

    await ctx.deleteMessage()

    const message = await ctx.reply(
        `📖 Доступные команды:

        /start — открыть меню
        `)
    await addMessageSession(
        ctx.from.id,
        SessionMessageType.Command, {
            messageId: message.message_id
        }
    )
}
