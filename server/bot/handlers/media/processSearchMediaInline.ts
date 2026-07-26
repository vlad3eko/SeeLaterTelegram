import {FormatDate, FormatRating} from "~/utils/formatMoviesData";
import {keyboardSendMediaCardInline} from "#server/bot/consts/buttons/keyboardBot";
import {CONTENT_TYPE_LABELS} from "~/utils/convert/library/enumsLibrary";
import type {ContentType} from "~/utils/search/strategy/enums";

export const processSearchMediaInline = async (ctx: any, medias: any) => {

    try {
        const results = medias.results.map(
            (media: any) => ({
                type: 'article',
                id: `${medias.page}_${media.media_type}_${media.content_type}_${media.id}`,
                title: (media.title || media.name),

                description:
                    `${CONTENT_TYPE_LABELS[media.content_type as ContentType]} | ${media.vote_average ? '💎' + FormatRating(media?.vote_average) + ' | ' : ''}${media.vote_count ? '🍿' + media.vote_count + ' | ' : ''}${FormatDate(media.release_date)}`,

                thumb_url:
                    media.poster_path
                        ? `https://image.tmdb.org/t/p/w500${media.poster_path}`
                        : media.backdrop_path
                            ? `https://image.tmdb.org/t/p/w500${media.backdrop_path}`
                            : undefined,

                input_message_content: {
                    message_text:
                        'bot: ⏳ Загружаю карточку...'
                },

                reply_markup:
                    keyboardSendMediaCardInline(
                        media.id,
                        media.media_type,
                        media.content_type
                    )
            })
        )

        console.log('[RESULTS]', results)

        await ctx.answerInlineQuery(
            results,
            {
                button: {
                    text: '🔍 Расширенный поиск',
                    start_parameter: 'inline_settings'
                },
                cache_time: 3,
                // is_personal: false,
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
