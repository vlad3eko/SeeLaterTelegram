import {createMediaCaption} from "#server/bot/consts/media/createMediaCaption";
import {keyboardSendMediaCardInline} from "#server/bot/consts/buttons/keyboardBot";

export const processSearchMediaInline = async (ctx: any, medias: any) => {

    try {
        const results = medias.results.map((media: any) => ({
            type: 'photo',
            id: `${media.media_type}_${media.id}`,

            photo_url: `https://image.tmdb.org/t/p/w500${media.poster_path}`,
            thumbnail_url: `https://image.tmdb.org/t/p/w500${media.poster_path}`,

            caption: createMediaCaption(media, media.media_type),

            parse_mode: 'HTML',
            reply_markup: keyboardSendMediaCardInline(media.id, media.media_type)
        }))

        await ctx.answerInlineQuery(results)
    } catch (e) {
        console.log('Ошибка: ', e)
        await ctx.answerInlineQuery([])
    }
}
