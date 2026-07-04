export const addSessionMessage = async (telegramId: number, messageId: number) => {

    if ((!telegramId && !messageId)) return

    await $fetch('/api/bot/session/editAddSessionMessage', {
        method: 'POST',
        body: {
            telegram_id: telegramId,
            message_id: messageId
        }
    })
}
