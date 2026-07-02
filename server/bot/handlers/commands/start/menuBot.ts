import {Markup} from "telegraf";

export const menuBot = async (ctx: any) => {
    await ctx.reply(`Добро пожаловать ${ctx.from.first_name || ctx.from.username}`,
        Markup.inlineKeyboard([
            Markup.button.url(
                'Перейти на сайт',
                'https://see-later-telegram.vercel.app/bookmarks'
            ),
            Markup.button.callback(
                'Поиск',
                'add_media'
            ),
            Markup.button.callback(
                'Сохранённые',
                'add_media'
            )
        ]),
    )
}
