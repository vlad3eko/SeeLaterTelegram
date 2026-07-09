import {createMediaCaption} from "#server/bot/consts/media/createMediaCaption";
import {keyboardSendMediaCardInline} from "#server/bot/consts/buttons/keyboardBot";

export const deleteMedia = async (ctx: any) => {

    await ctx.answerCbQuery('Удаление...')

    const telegramId = ctx.from.id
    const mediaId = Number(ctx.match[1])
    const mediaType = ctx.match[2]

    const media = await $fetch('/api/bot/getMediaBot', {
        query: {
            id: mediaId,
            media: mediaType
        }
    })

    await ctx.editMessageCaption(
        createMediaCaption(
            media,
            false,
            mediaType
        ),
        {
            parse_mode: 'HTML',
            reply_markup: keyboardSendMediaCardInline(
                media.id,
                mediaType
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
}
