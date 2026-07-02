import {addMediaState} from "#server/bot/consts/addMedia/addMediaState";
import {addMovie} from "#server/bot/actions/addMedia";
import {processTelegramAuth} from "#server/bot/services/auth/processTelegramAuth";
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

    await ctx.answerCbQuery()
    await ctx.deleteMessage()
}
