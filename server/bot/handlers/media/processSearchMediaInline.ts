import {createMediaCaption} from "#server/bot/consts/media/createMediaCaption";
import {keyboardSendMediaCardInline} from "#server/bot/consts/buttons/keyboardBot";

export const processSearchMediaInline = async (ctx: any, medias: any) => {

    try {
        const results = medias.results.map((media: any) => ({
            type: 'article',

            id: String(media.id),

            photo_url: `https://image.tmdb.org/t/p/w500${media.poster_path}`,
            thumbnail_url: `https://image.tmdb.org/t/p/w500${media.poster_path}`,

            title: media.title || media.name,

            description: 'фильм | imdb 7.9 | 2008',

            input_message_content: {
                message_text: 'test'
            }
        }))

        console.log('result', results[0])
        await ctx.answerInlineQuery(results)
    } catch (e) {
        console.log('Ошибка: ', e)
        await ctx.answerInlineQuery([])
    }
}
