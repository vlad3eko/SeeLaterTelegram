import {Markup} from "telegraf";

export const failedLoginToken = async (ctx: any) => {
    await ctx.reply(`Добро пожаловать ${ctx.from.first_name || ctx.from.username}`,
        Markup.inlineKeyboard([
            Markup.button.url(
                'Перейти на сайт',
                'https://see-later-telegram.vercel.app/bookmarks'
            ),
            Markup.button.callback(
                'Сохранить фильм',
                'add_media'
            ),
        ]),
        Markup.inlineKeyboard([
            Markup.button.callback(
                'Сохранённые',
                'add_media'
            )
        ])
    )
    return
}
