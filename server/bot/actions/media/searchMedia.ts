import {addMediaState} from "#server/bot/consts/media/addMediaState";
import {Markup} from "telegraf";

interface SearchMediaOptions {
    mode?: string
}

export const searchMedia = async (ctx: any, options: SearchMediaOptions = {}) => {
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

    switch (options.mode) {
        case 'keep':
            await ctx.answerCbQuery()
            break

        case 'default':
            await ctx.deleteMessage()
    }
}
