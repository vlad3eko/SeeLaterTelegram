import {Markup} from "telegraf";
import {addMessageSession} from "#server/bot/services/session/addMessageSession";

export const menuBot = async (ctx: any) => {

    await ctx.answerCbQuery()
    await ctx.deleteMessage()

    const message = await ctx.reply(`Добро пожаловать ${ctx.from.first_name || ctx.from.username}`,
        Markup.inlineKeyboard([
            Markup.button.url(
                'Перейти на сайт',
                'https://see-later-telegram.vercel.app/bookmarks'
            ),
            Markup.button.callback(
                'Поиск',
                'search_media'
            ),
            Markup.button.callback(
                'Сохранённые',
                'search_media'
            )
        ]),
    )
    await addMessageSession(
        ctx.from.id,
        message.message_id
    )
}
