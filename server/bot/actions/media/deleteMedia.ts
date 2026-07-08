export const deleteMedia = async (ctx: any) => {

    await ctx.answerCbQuery('Удаление...')

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
