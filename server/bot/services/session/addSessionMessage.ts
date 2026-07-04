export const addSessionMessage = async (telegramId: number, messageId: number) => {

    if ((!telegramId && !messageId)) {
        console.log('возврат')
        console.log('прошла', telegramId + ':', messageId)
    }
    console.log('прошла', telegramId + ':', messageId)
    console.log('telegramId', telegramId)
    console.log('messageId', messageId)

    await $fetch('/api/bot/session/editAddSessionMessage', {
        method: 'POST',
        body: {
            telegram_id: telegramId,
            message_id: messageId
        }
    })
}
