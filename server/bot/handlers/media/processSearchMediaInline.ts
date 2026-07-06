import {createMediaCaption} from "#server/bot/consts/media/createMediaCaption";

export const processSearchMediaInline = async (ctx: any, medias: any) => {

    console.log('media', medias)
    console.log('media', medias[0].genre_ids)

    // try {
    //     const results = medias.results.map((media: any) => ({
    //         type: 'article',
    //         id: String(media.id),
    //         poster: media.poster_path || media.backdrop_path,
    //         title: media.title || media.name,
    //         media_type: media.media_type,
    //         genres: media.genre_ids,
    //         overview: media.overview,
    //         count: media.vote_count,
    //         vote: media.vote_average,
    //         release_date: media.release_date || media.first_air_date,
    //
    //         input_message_content: {
    //             message_text: createMediaCaption(media, false, media.media_type),
    //             parse_mode: 'HTML'
    //         },
    //         reply_markup: {
    //             inline_keyboard: [
    //                 [
    //                     {
    //                         text: 'Выбрать',
    //                         callback_data: `media_${media.id}_${media.media_type}`
    //                     },
    //                 ]
    //             ]
    //         },
    //     }))
    //
    //     await ctx.answerInlineQuery(results)
    // } catch (e) {
    //     console.log('Ошибка: ', e)
    //     await ctx.answerInlineQuery([])
    // }
}
