import {FormatDate} from "~/utils/formatMoviesData";
import {dateConvert} from "~/utils/convert/dateConvert";
import {dateIsoConvert} from "~/utils/convert/dateIsoConvert";
import type {TmdbGenre} from "~/types/tmdb.types";
import {releaseDate} from "#server/bot/consts/media/releaseDate";

export const selectMedia = async (ctx: any) => {

    await ctx.answerCbQuery()

    const mediaId = Number(ctx.match[1])
    const mediaType = String(ctx.match[2])

    const media = await $fetch(
        '/api/bot/getMediaBot',
        {
            query: {
                id: mediaId,
                media: mediaType
            }
        }
    )

    const releaseDateUndefined = '❌официальной даты пока нет'

    const mediaPoster = media.poster_path || media.backdrop_path
    const mediaTitle = media.title || media.name
    const mediaOverview = media.overview
    const releaseYear = FormatDate(media.release_date || media.first_air_date) || releaseDateUndefined

    const mediaTypeConvert = (type: string) => {
        if (type === 'movie') {
            return 'фильма'
        } else {
            return 'сериала'
        }
    }

    const genresContent = media.genres
        .map((i: TmdbGenre) => i.name)
        .join(' / #')

    const captionContent =
        `<code>${mediaTitle} (${releaseYear})</code> 
                <blockquote expandable>${mediaOverview}</blockquote> <b>Жанр:</b> <i>#${genresContent}</i> <b>Премьера ${mediaTypeConvert(mediaType)}</b>: <i>${releaseDate(media)} </i> \n<b>Статус:</b> ✅Cохранён`

    const callbackData =
        `${ctx.from.id}_${media.id}_${mediaType}`

    await ctx.replyWithPhoto(
        `https://image.tmdb.org/t/p/w500${mediaPoster}`,
        {
            caption: captionContent,
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: '⬅️ Назад',
                            callback_data: `back_${ctx.from.id}`
                        }
                    ],
                    [
                        {
                            text: '💾 Сохранить',
                            callback_data: `save_media_${callbackData}`
                        }
                    ]
                ]
            },
            parse_mode: 'HTML'
        }
    )
}
