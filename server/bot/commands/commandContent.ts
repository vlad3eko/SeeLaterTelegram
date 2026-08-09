import {addMessageSession} from "#server/bot/services/session/addMessageSession";
import {SessionMessageType} from "#server/bot/consts/types/SessionMessageTypes";
import {startContentKeyboard} from "#server/bot/consts/buttons/admin/contentEngine/keyboardRepository";

export const commandContent = async (ctx: any) => {
    await ctx.deleteMessage()

    const message = await ctx.reply(
        `Список вариантов генерации.`,
        {
            reply_markup: startContentKeyboard(ctx.from.id),
            link_preview_options: {
                is_disabled: true
            }
        },
    )

    await addMessageSession(
        ctx.from.id,
        SessionMessageType.Menu, {
            messageId: message.message_id
        }
    )
}
