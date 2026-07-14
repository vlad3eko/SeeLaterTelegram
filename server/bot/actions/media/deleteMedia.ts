import {createMediaCaption} from "#server/bot/consts/media/createMediaCaption";
import {keyboardSendMediaCardInline} from "#server/bot/consts/buttons/keyboardBot";
import {checkChannelSubscriber} from "#server/bot/handlers/auth/check/checkChannelSubscriber";

export const deleteMedia = async (ctx: any) => {

    const isUserBot = await checkChannelSubscriber(ctx)

    if (isUserBot) {
        await ctx.answerCbQuery('✅ Удалено из вашей коллекции')
    } else {
        await ctx.answerCbQuery('❌ Подпишитесь на 🏷Киноманов BOT')
        return
    }


    const telegramId = ctx.from.id
    const mediaId = Number(ctx.match[1])
    // const mediaType = ctx.match[2]

    // const media = await $fetch('/api/bot/getMediaBot', {
    //     query: {
    //         id: mediaId,
    //         media: mediaType
    //     }
    // })
    //
    // await ctx.editMessageCaption(
    //     createMediaCaption(
    //         media,
    //         mediaType
    //     ),
    //     {
    //         parse_mode: 'HTML',
    //         reply_markup: keyboardSendMediaCardInline(
    //             media.id,
    //             mediaType,
    //             telegramId
    //         )
    //     }
    // )

    await $fetch('/api/bot/deleteMediaBot', {
        method: 'POST',
        body: {
            telegram_id: telegramId,
            tmdb_id: mediaId
        }
    })
}
