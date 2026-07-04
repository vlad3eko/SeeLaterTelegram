export const addSessionMessage = async (telegramId: number, messageId: number) => {

    console.log('telegramId',telegramId)
    console.log('messageId',messageId)
    if ((!telegramId && !messageId)) return

    await $fetch('/api/bot/session/editAddSessionMessage', {
        method: 'POST',
        body: {
            telegram_id: telegramId,
            message_id: messageId
        }
    })
}
