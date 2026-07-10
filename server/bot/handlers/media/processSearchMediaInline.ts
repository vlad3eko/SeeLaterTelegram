import {createMediaCaption} from "#server/bot/consts/media/createMediaCaption";
import {keyboardSendMediaCardInline} from "#server/bot/consts/buttons/keyboardBot";
import {FormatDate} from "~/utils/formatMoviesData";

export const processSearchMediaInline = async (ctx: any, medias: any) => {

    try {
        const results = medias.results.map((media: any) => ({
            type: 'photo',

            id: String(media.id),

            photo_url: `https://image.tmdb.org/t/p/w500${media.poster_path}`,
            thumbnail_url: `https://image.tmdb.org/t/p/w500${media.poster_path}`,

            title: media.title || media.name,

            description: `${media.media_type} | imdb 7.9 | (${FormatDate(media.release_date || media.first_air_date) || '❌ отсутствует'})`,

            message_text: createMediaCaption(media, media.media_type),
            parse_mode: 'HTML',
            reply_markup: keyboardSendMediaCardInline(media.id, media.media_type)
        }))

        console.log('result', results[0])
        await ctx.answerInlineQuery(results)
    } catch (e) {
        console.log('Ошибка: ', e)
        await ctx.answerInlineQuery([])
    }
}
// caption:

