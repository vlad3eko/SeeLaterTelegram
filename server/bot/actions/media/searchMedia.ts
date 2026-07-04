import {addMediaState} from "#server/bot/consts/media/addMediaState";
import {Markup} from "telegraf";
import {addSessionMessage} from "#server/bot/services/session/addSessionMessage";

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


    const message = await ctx.reply(reply, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
            Markup.button.callback('меню', 'menu_bot')
        ])
    })

    await addSessionMessage(ctx.from.id, message.message_id)

    switch (options.mode) {
        case 'keep':
            await ctx.answerCbQuery()
            break

        default:
            await ctx.deleteMessage()
            break
    }
}
