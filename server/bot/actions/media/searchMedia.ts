import {addMediaState} from "#server/bot/consts/media/addMediaState";
import {Markup} from "telegraf";
import {addMessageSession} from "#server/bot/services/session/addMessageSession";
import {SessionMessageType} from "#server/bot/consts/types/SessionMessageTypes";

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

    await addMessageSession(ctx.from.id, message.message_id, SessionMessageType.Menu)

    switch (options.mode) {
        case 'keep':
            await ctx.answerCbQuery()
            break

        default:
            await ctx.deleteMessage()
            break
    }
}
