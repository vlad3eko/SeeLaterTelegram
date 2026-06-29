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
    const mediaPoster = media.poster_path || media.backdrop_path
    const mediaTitle = media.title || media.name
    const mediaOverview = media.overview
    const voteAverage = media.vote_average
    const voteCount = media.vote_count
    const voteReleaseDate = media.release_date
    const releaseYear = FormatDate(media.release_date || media.first_air_date)
    const releaseDate = dateConvert(media.release_date) || dateIsoConvert(media.first_air_date)

    await ctx.reply(`mediaPoster ${mediaPoster}`,)
    await ctx.reply(`mediaTitle ${mediaTitle}`,)
    await ctx.reply(`mediaOverview ${mediaOverview}`,)
    await ctx.reply(`voteAverage ${voteAverage}`,)
    await ctx.reply(`voteCount ${voteCount}`,)
    await ctx.reply(`voteReleaseDate ${voteReleaseDate}`,)
    await ctx.reply(`releaseYear ${releaseYear}`,)
    await ctx.reply(`releaseDate ${releaseDate}`,)

    await ctx.replyWithPhoto(
        `https://image.tmdb.org/t/p/w500${mediaPoster}`,
        {
            caption:
                `${mediaTitle} ${releaseYear} \n\n${mediaOverview} \n\nДата выхода: ${releaseDate}`,
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
                            callback_data: `save_${ctx.from.id}_${media.id}_${mediaType}_${mediaPoster}_${voteAverage}_${voteCount}_${voteReleaseDate}`
                        }
                    ]
                ]
            }
        }
    )
}
