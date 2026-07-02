import {FormatDate} from "~/utils/formatMoviesData";
import {dateConvert} from "~/utils/convert/dateConvert";
import {dateIsoConvert} from "~/utils/convert/dateIsoConvert";

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

    const releaseDate = () => {
        const mediaDate = dateConvert(media.release_date) || dateIsoConvert(media.first_air_date);

        if (mediaDate) {
            const [day, month, year] = mediaDate.split('.');
            const mediaTimestamp = new Date(`${year}-${month}-${day}`).getTime();
            const todayTimestamp = new Date().getTime();
            const isFuture = todayTimestamp > mediaTimestamp;

            return isFuture ? `✅ ${mediaDate}` : `❌ ${mediaDate}`;
        } else {
            return releaseDateUndefined
        }
    }

    console.log('releaseDate', releaseDate())

    const mediaTypeConvert = (type: string) => {
        if (type === 'movie') {
            return 'фильма'
        } else {
            return 'сериала'
        }
    }

    const genresContent = media.genres
        .map(i => i.name)
        .join(' / #')

    const captionContent =
        `<code>${mediaTitle} (${releaseYear})</code> 
                <blockquote expandable>${mediaOverview}</blockquote> \n<b>Жанр:</b> <i>#${genresContent}</i> \n<b>Премьера ${mediaTypeConvert(mediaType)}</b>: <i>${releaseDate()} </i>`

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
                            callback_data: `save_${callbackData}`
                        }
                    ]
                ]
            },
            parse_mode: 'HTML'
        }
    )
}
