import {createMediaCaption} from "#server/bot/consts/media/createMediaCaption";

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

    const callbackData =
        `${ctx.from.id}_${media.id}_${mediaType}`

    await ctx.replyWithPhoto(
        `https://image.tmdb.org/t/p/w500${mediaPoster}`,
        {
            caption: createMediaCaption(media, false, mediaType),
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
                            text: '💾 Сохранить в коллекцию',
                            callback_data: `save_media_${callbackData}`
                        }
                    ]
                ]
            },
            parse_mode: 'HTML'
        }
    )
}
