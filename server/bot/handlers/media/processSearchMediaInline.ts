import {FormatDate, FormatRating} from "~/utils/formatMoviesData";
import {keyboardSendMediaCardInline} from "#server/bot/consts/buttons/keyboardBot";

export const processSearchMediaInline = async (ctx: any, medias: any) => {
    try {

        const results = medias.results.map(
            (media: any, index: number) => ({
                type: 'article',
                id: `${media.media_type}_${media.tmdb_id || media.id}_${medias.page}`,
                title: (media.title || media.name),

                description:
                    `${media.media_type === 'movie' ? 'Фильм' : 'Сериал'} | ${media.vote_average ? '💎' + FormatRating(media?.vote_average) + ' | ' : ''}${media.vote_count ? '🍿' + media.vote_count + ' | ' : ''}${FormatDate(media.release_date)}`,

                thumb_url:
                    media.poster_path
                        ? `https://image.tmdb.org/t/p/w500${media.poster_path}`
                        : `https://image.tmdb.org/t/p/w500${media.backdrop_path}`,

                input_message_content: {
                    message_text:
                        'bot: Загрузка карточки...'
                },

                reply_markup:
                    keyboardSendMediaCardInline(
                        media.tmdb_id || media.id,
                        media.media_type
                    )
            })
        )

        await ctx.answerInlineQuery(
            results,
            {
                next_offset:
                    medias.page < medias.total_pages
                        ? String(medias.page + 1)
                        : ''
            }
        )

    } catch (e) {
        console.log('Ошибка inline:', e)
        await ctx.answerInlineQuery([])
    }
}
