export async function deleteMessages(ctx: any, offsets: number[]) {
    await ctx.answerCbQuery()

    if (!ctx.callbackQuery?.message) {
        console.log('Сообщение для удаления не найдено')
        return
    }

    const chatId = ctx.chat?.id
    if (!chatId) {
        console.log('ID чата не найден')
        return
    }

    const currentId = ctx.callbackQuery.message.message_id

    const messageIds = offsets.map(offset => currentId + offset)

    try {
        await ctx.telegram.deleteMessages(chatId, messageIds)
    } catch (error) {
        if (error instanceof Error) {
            console.log('Не удалось удалить сообщения:', error.message)
        } else {
            console.log('Неизвестная ошибка:', error)
        }
    }
}
