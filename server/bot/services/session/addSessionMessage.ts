export const addSessionMessage = async (telegramId: number, messageId: number, ctx?: any) => {

    console.log('ctx', ctx)
    console.log('telegramId', telegramId)
    console.log('messageId', messageId)

    if ((!telegramId && !messageId)) {
        console.log('возврат', telegramId + ':', messageId)
        return
    }

    // await $fetch('/api/bot/session/editAddSessionMessage', {
    //     method: 'POST',
    //     body: {
    //         telegram_id: telegramId,
    //         message_id: messageId
    //     }
    // })
}
