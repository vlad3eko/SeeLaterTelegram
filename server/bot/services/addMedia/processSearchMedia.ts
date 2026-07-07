import {searchMediaResults} from "#server/bot/consts/media/saveMediaSearch";
import {Markup} from "telegraf";
import {FormatDate} from "~/utils/formatMoviesData";
import {addMessageSession} from "#server/bot/services/session/addMessageSession";
import {SessionMessageType} from "#server/bot/consts/types/SessionMessageTypes";

export const processSearchMedia = async (ctx: any, medias: any) => {

    await ctx.deleteMessage()

    if (!medias.results.length) {

        const title = ctx.message?.text ?? 'Запрос'

        const messageNotFound = await ctx.reply(
            `${title} - не найден.`,
            Markup.inlineKeyboard([
                Markup.button.callback(
                    'Нажмите чтобы повторить',
                    'search_media'
                )
            ])
        )
        await addMessageSession(
            ctx.from.id,
            messageNotFound.message_id,
            SessionMessageType.Error
        )
        return
    }

    const result =
        medias.results.slice(0, 5)

    searchMediaResults.set(
        ctx.from.id,
        result
    )

    const messageChooseMedia = await ctx.reply(
        'Выберите из списка:',
        {
            reply_markup: {
                inline_keyboard: [
                    ...result.map(
                        (media: any) => [
                            {
                                text: `${media.title || media.name} (${FormatDate(media.release_date || media.first_air_date)})`,
                                callback_data: `media_${media.id}_${media.media_type}`
                            },
                        ]),
                    [
                        {
                            text: 'меню',
                            callback_data: 'menu_bot'
                        }
                    ]
                ]
            },
        },
    )
    await addMessageSession(
        ctx.from.id,
        messageChooseMedia.message_id,
        SessionMessageType.Search
    )
}
