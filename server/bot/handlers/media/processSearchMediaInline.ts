import {createMediaCaption} from "#server/bot/consts/media/createMediaCaption";
import {keyboardSendMediaCardInline} from "#server/bot/consts/buttons/keyboardBot";

export const processSearchMediaInline = async (ctx: any, medias: any) => {

    try {
        const results = medias.results.map((media: any) => {

            const year =
                (media.release_date || media.first_air_date || '')
                    .slice(0, 4)

            const title =
                media.title || media.name

            const type =
                media.media_type === 'movie'
                    ? 'фильм'
                    : 'сериал'

            const genres =
                media.genres
                    ?.map((g: any) => g.name)
                    .slice(0, 3)
                    .join(', ')

            return {

                type: 'photo',

                id: `${media.media_type}_${media.id}`,

                title,

                description:
                    `${type} | imdb:${media.vote_average?.toFixed(1)} | ${year}
${genres}`,

                photo_url:
                    `https://image.tmdb.org/t/p/w500${media.poster_path}`,

                thumbnail_url:
                    `https://image.tmdb.org/t/p/w500${media.poster_path}`,

                caption: createMediaCaption(
                    media,
                    media.media_type
                ),

                parse_mode: 'HTML',

                reply_markup:
                    keyboardSendMediaCardInline(
                        media.id,
                        media.media_type
                    )
            }

        })

        console.log('result', results[0])
        await ctx.answerInlineQuery(results)
    } catch (e) {
        console.log('Ошибка: ', e)
        await ctx.answerInlineQuery([])
    }
}
