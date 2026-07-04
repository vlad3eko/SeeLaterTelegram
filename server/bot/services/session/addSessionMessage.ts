export const addSessionMessage = async (telegramId: number, messageId: number, ctx?: any) => {

    if ((!telegramId && !messageId)) {
        console.log('возврат', telegramId + ':', messageId)
        return
    }

    console.log('прошло', telegramId + ':', messageId)

    await $fetch('/api/bot/session/editAddSessionMessage', {
        method: 'POST',
        body: {
            telegram_id: telegramId,
            message_id: messageId
        }
    })
}
