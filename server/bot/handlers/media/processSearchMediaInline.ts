import {FormatDate} from "~/utils/formatMoviesData";
import {keyboardSendMediaCardInline} from "#server/bot/consts/buttons/keyboardBot";

export const processSearchMediaInline = async (ctx: any, medias: any) => {

    const uniqueResults =
        Array.from(
            new Map(
                medias.results.map(
                    (media: any) => [
                        `${media.media_type}_${media.id}`,
                        media
                    ]
                )
            ).values()
        )



    try {
        const results = uniqueResults.map((media: any) => ({
            type: 'article',
            id: `${media.media_type}_${media.id}`,
            title: media.title || media.name || 'без названия',
            description: `${media.media_type} | imdb 7.9 | (${FormatDate(media.release_date || media.first_air_date) || '❌ отсутствует'})`,
            thumb_url: `https://image.tmdb.org/t/p/w500${media.poster_path}`,
            message_text: 'bot: Загрузка карточки...',
            reply_markup: keyboardSendMediaCardInline(media.id, media.media_type)
        }))

        await ctx.answerInlineQuery(results)

    } catch (e) {
        console.log('Ошибка inline:', e)
        await ctx.answerInlineQuery([])
    }
}
