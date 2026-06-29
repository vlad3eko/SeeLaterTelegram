import me from "#server/api/auth/me";
import {Markup} from "telegraf";

export const saveMedia = async (ctx: any) => {

    await ctx.answerCbQuery()

    const userId = Number(ctx.match[1])
    const mediaId = Number(ctx.match[2])
    const mediaType = ctx.match[3]
    const mediaPoster = ctx.match[4]
    const voteAverage = ctx.match[5]
    const voteCount = ctx.match[6]
    const releaseDate = ctx.match[7]


    await ctx.reply(ctx)
    console.log('ctx', ctx)
    await ctx.reply(userId)
    await ctx.reply(mediaId)
    await ctx.reply(mediaType)
    await ctx.reply(mediaPoster)
    await ctx.reply(voteAverage)
    await ctx.reply(voteCount)
    await ctx.reply(releaseDate)

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
                `Неизвестная ошибка: ${error?.message}`
            )
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
