import {searchMediaResults} from "#server/bot/consts/media/saveMediaSearch";
import {Markup} from "telegraf";
import {FormatDate} from "~/utils/formatMoviesData";
import {addSessionMessage} from "#server/bot/services/session/addSessionMessage";

export const processSearchMedia = async (ctx: any, medias: any) => {

    await ctx.deleteMessage()

    if (!medias.results.length) {

        const title = ctx.message?.text ?? 'Запрос'

        const message = await ctx.reply(
            `${title} - не найден.`,
            Markup.inlineKeyboard([
                Markup.button.callback(
                    'Нажмите чтобы повторить',
                    'search_media'
                )
            ])
        )
        await addSessionMessage(
            ctx.from.id,
            message.message_id
        )
        return
    }

    const result =
        medias.results.slice(0, 5)

    searchMediaResults.set(
        ctx.from.id,
        result
    )

    const message = await ctx.reply(
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
            }
        },
    )
    await addSessionMessage(
        ctx.from.id,
        message.message_id
    )
}
