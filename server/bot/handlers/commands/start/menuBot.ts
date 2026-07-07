import {Markup} from "telegraf";
import {addMessageSession} from "#server/bot/services/session/addMessageSession";
import {SessionMessageType} from "#server/bot/consts/types/SessionMessageTypes";
import {keyboardSMenuBot} from "#server/bot/consts/buttons/keyboardBot";

export const menuBot = async (ctx: any) => {

    await ctx.deleteMessage()

    const message = await ctx.reply(
        `Привет ${ctx.from.first_name || ctx.from.username}

🔍 Для поиска используй кнопки ниже или отправь в сообщении название кино\n
Связь: https://t.me/kinomanovnet?direct`,
        {
            reply_markup: keyboardSMenuBot(),
            link_preview_options: {
                is_disabled: true
            }
        },
    )


    await addMessageSession(
        ctx.from.id,
        message.message_id,
        SessionMessageType.Menu
    )
}
