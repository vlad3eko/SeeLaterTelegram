export const saveMedia = async (ctx: any) => {

    const userId = Number(ctx.match[1])
    const mediaTitle = ctx.match[2]
    const mediaId = Number(ctx.match[3])
    const mediaType = ctx.match[4]

    console.log('userId', userId)
    console.log('mediaTitle', mediaTitle)
    console.log('mediaId', mediaId)
    console.log('mediaType', mediaType)

    const {success, error} = await $fetch('/api/bot/saveMediaBot', {
        method: 'POST',
        body: {
            userId,
            mediaTitle,
            mediaId,
            mediaType
        }
    })

    console.log('success', success)

    if (!success) {
        if (error?.message.includes('duplicate key value')) {

            await ctx.reply(
                `❌ Ошибка: уже находится в базе`
            )
        return
        } else {
            await ctx.reply(
                `Ошибка: ${error.message}`
            )
        }
    }

    await ctx.reply(
        '✅ Фильм сохранён'
    )
}
