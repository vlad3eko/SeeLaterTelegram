import {Markup} from "telegraf";
import {addMessageSession} from "#server/bot/services/session/addMessageSession";
import {SessionMessageType} from "#server/bot/consts/types/SessionMessageTypes";

export const menuBot = async (ctx: any) => {

    await ctx.deleteMessage()

    const message = await ctx.reply(
        `🍿 Привет ${ctx.from.first_name || ctx.from.username}

🔍 Для поиска используй кнопки ниже или отправь в сообщении название кино`,
        {
            reply_markup: Markup.inlineKeyboard([
                [
                    Markup.button.switchToCurrentChat(
                        '🔍 Поиск',
                        ''
                    )
                ]
            ]).reply_markup
        }
    )

    await addMessageSession(
        ctx.from.id,
        message.message_id,
        SessionMessageType.Menu
    )
}
