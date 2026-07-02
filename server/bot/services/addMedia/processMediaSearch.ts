import {addMediaState} from "#server/bot/consts/addMedia/addMediaState";
import {Markup} from "telegraf";

export const processMediaSearch = async (ctx: any) => {
    addMediaState.set(
        ctx.from.id,
        {
            waitingMovie: true
        }
    )

    await ctx.reply(
        'Введите название:',
        Markup.inlineKeyboard([
            Markup.button.callback(
                'меню',
                'menu_bot'
            )
        ])
    )

    await ctx.deleteMessage()
}
