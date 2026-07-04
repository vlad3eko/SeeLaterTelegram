import {addSessionMessage} from "#server/bot/services/session/addSessionMessage";

export const deleteMedia = async (ctx: any) => {
    await ctx.answerCbQuery()

    const telegramId = ctx.from.id
    const mediaId = Number(ctx.match[1])

    await $fetch('/api/bot/deleteMediaBot', {
        method: 'POST',
        body: {
            telegram_id: telegramId,
            tmdb_id: mediaId
        }
    })
    await addSessionMessage(ctx.from.id, ctx.message_id, ctx)
    await ctx.deleteMessage()
}
