import {createMediaCaption} from "#server/bot/consts/media/createMediaCaption";

export const processSearchMediaInline = async (ctx: any, medias: any) => {

    const createInlineMessage = (media: any) => {
        return `
${media.title || media.name}
${media.release_date || media.first_air_date}
⭐ ${media.vote_average}
`
    }

    const results = medias.results.map((media: any) => ({
        type: 'article',
        id: String(media.id),
        poster: media.poster_path || media.backdrop_path,
        title: media.title || media.name,
        media_type: media.media_type,
        genres: media.genre_ids,
        overview: media.overview,
        count: media.vote_count,
        vote: media.vote_average,
        release_date: media.release_date || media.first_air_date,

        input_message_content: {
            message_text: createInlineMessage(media),
        },
        reply_markup: {
            inline_keyboard: [
                [
                    {
                        text: 'Выбрать',
                        callback_data: `media_${media.id}_${media.media_type}`
                    },
                ]
            ]
        },
    }))

    await ctx.answerInlineQuery(results)
    console.log('medias', medias)
}
