export const saveMedia = async (ctx: any) => {

    const userId = Number(ctx.match[1])
    const mediaTitle = ctx.match[2]
    const mediaId = Number(ctx.match[3])
    const mediaType = ctx.match[4]

    await ctx.reply('Старт сохранения')

    const {success, error} = await $fetch('/api/bot/saveMediaBot', {
        method: 'POST',
        body: {
            userId,
            mediaTitle,
            mediaId,
            mediaType
        }
    })

    await ctx.reply('Ентри сохранения')


    if (!success) {
        if (error?.message.includes('duplicate key value'))
        await ctx.reply(
            `❌ Ошибка: уже находится в базе`
        )
        return
    }

    await ctx.reply(
        '✅ Фильм сохранён'
    )
}
