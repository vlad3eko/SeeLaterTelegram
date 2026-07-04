export const addSessionMessage = async (telegramId: number, messageId: number, ctx?: any) => {

    console.log('принял ctx', ctx)
    if ((!telegramId && !messageId)) {
        console.log('возврат', telegramId + ':', messageId)
    console.log('возврат ctx')
    }
    console.log('прошёл ctx')
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
