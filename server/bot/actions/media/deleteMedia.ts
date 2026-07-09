import {createMediaCaption} from "#server/bot/consts/media/createMediaCaption";
import {keyboardSendMediaCardInline} from "#server/bot/consts/buttons/keyboardBot";

export const deleteMedia = async (ctx: any) => {

    await ctx.answerCbQuery('Удаление...')
    console.log('DELETE CLICKED')
    const telegramId = ctx.from.id
    const mediaId = Number(ctx.match[1])
    const mediaType = ctx.match[2]

    const media = await $fetch('/api/bot/getMediaBot', {
        query: {
            id: mediaId,
            media: mediaType
        }
    })


    console.log(
        JSON.stringify(
            keyboardSendMediaCardInline(media.id, media.media_type),
            null,
            2
        )
    )

    await ctx.editMessageCaption(
        createMediaCaption(
            media,
            false,
            media.media_type
        ),
        {
            parse_mode: 'HTML',
            reply_markup: keyboardSendMediaCardInline(
                media.id,
                media.media_type
            )
        }
    )

    await $fetch('/api/bot/deleteMediaBot', {
        method: 'POST',
        body: {
            telegram_id: telegramId,
            tmdb_id: mediaId
        }
    })

    await ctx.answerCbQuery('Удалено...')
}
