import {Markup} from "telegraf";

export const menuBot = async (ctx: any) => {

    await ctx.answerCbQuery()
    await ctx.deleteMessage()

    await ctx.reply(`Добро пожаловать ${ctx.from.first_name || ctx.from.username}`,
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
}
