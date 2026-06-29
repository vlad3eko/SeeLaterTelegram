import {Markup} from "telegraf";
import {dateConvert} from "~/utils/convert/dateConvert";
import {dateIsoConvert} from "~/utils/convert/dateIsoConvert";

export const saveMedia = async (ctx: any) => {

    await ctx.answerCbQuery()

    const userId = Number(ctx.match[1])
    const mediaId = Number(ctx.match[2])
    const mediaType = ctx.match[3]

    const media = await $fetch(
        '/api/bot/getMediaBot',
        {
            query: {
                id: mediaId,
                media: mediaType
            }
        }
    )

    const mediaTitle = media.title || media.name
    const voteAverage = media.vote_average || 0
    const voteCount = media.vote_count || 0
    const mediaPoster = media.poster_path || media.backdrop_path
    const releaseDate = (dateConvert(media.release_date) || dateIsoConvert(media.first_air_date)) || null

    console.log('media', media)
    console.log('dateConvert(media.release_date)', dateConvert(media.release_date))
    console.log('dateIsoConvert(media.first_air_date)', dateIsoConvert(media.first_air_date))
    console.log('releaseDate', releaseDate)

    const {success, error} = await $fetch('/api/bot/saveMediaBot', {
        method: 'POST',
        body: {
            userId,
            mediaTitle,
            mediaId,
            mediaType,
            mediaPoster,
            voteAverage,
            voteCount,
            releaseDate,
        }
    })

    if (!success) {
        if (error?.message.includes('duplicate key value')) {

            await ctx.reply(
                `❌ Ой: вы уже сохраняли - ${media.title || media.name}`
            )
            return
        } else {
            await ctx.reply(
                `❌ Неизвестная ошибка: ${error?.message}`
            )
            return
        }
    }

    await ctx.reply(
        '✅ Фильм сохранён',
        Markup.inlineKeyboard([
            Markup.button.callback(
                'Добавить ещё',
                'add_media'
            )
        ])
    )
}
