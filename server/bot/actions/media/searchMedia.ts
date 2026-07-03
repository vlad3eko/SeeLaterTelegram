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

    const reply = `<b>Введите название фильма.</b>
    <i>Можно писать не полностью — поиск работает по словам.</i>
                   \n<b>Например:</b>
    <i>если ищете «28 лет спустя», достаточно ввести «28» — и появятся все подходящие варианты.</i>`


    await ctx.reply(reply, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
            Markup.button.callback('меню', 'menu_bot')
        ])
    })

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
