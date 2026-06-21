import {Markup} from "telegraf";

export const failedLoginToken = async (ctx: any) => {
    await ctx.reply(`Добро пожаловать ${ctx.from.first_name || ctx.from.username}`,
        Markup.inlineKeyboard([
            Markup.button.url(
                'Перейти на сайт',
                'https://see-later-telegram.vercel.app/bookmarks'
            ),
            Markup.button.callback(
                'Добавить фильм',
                'add_media'
            )
        ])
    )
    return
}
