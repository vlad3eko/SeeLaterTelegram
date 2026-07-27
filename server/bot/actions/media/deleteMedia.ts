import {checkChannelSubscriber} from "#server/bot/handlers/auth/check/checkChannelSubscriber";
import {createMediaCaption} from "#server/bot/consts/media/createMediaCaption";

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

    await $fetch('/api/bot/deleteMediaBot', {
        method: 'POST',
        body: {
            telegram_id: telegramId,
            tmdb_id: mediaId
        }
    })


}
