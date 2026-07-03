import {addMediaState} from "#server/bot/consts/media/addMediaState";
import {Markup} from "telegraf";

interface SearchMediaOptions {
    mode?: string
}

export const searchMedia = async (ctx: any, options: SearchMediaOptions = {}, startId?: number | undefined) => {
    addMediaState.set(
        ctx.from.id,
        {
            waitingMovie: true
        }
    )

    await ctx.reply(
        'Введите название фильма.\n' +
        'Можно писать не полностью — поиск работает по словам.\n' +
        '\n' +
        'Например:\n' +
        'если ищете «28 лет спустя», достаточно ввести «28» — и появятся все подходящие варианты.',
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

        case 'start':
            await ctx.telegram.deleteMessage(ctx.chat.id, startId)
            break

        case 'default':
            await ctx.deleteMessage()
            break
    }
}
