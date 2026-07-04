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

    const reply = `<code>Введите название фильма.</code>
    <i>Можно писать не полностью — поиск работает по словам.</i>
                   \n<code>Например:</code>
    <i>если ищете «<code>28 лет спустя</code>», достаточно ввести «<code>28</code>» — и появятся все подходящие варианты.</i>`


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
            if (startId)
            await ctx.telegram.deleteMessage(ctx.chat.id, startId + 1)
            break

        case 'default':
            await ctx.deleteMessage()
            break
    }
}
