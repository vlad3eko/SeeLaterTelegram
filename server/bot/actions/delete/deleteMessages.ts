export async function deleteMessages(ctx: any, offsets: number[]) {

    const chatId = ctx.chat.id
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
