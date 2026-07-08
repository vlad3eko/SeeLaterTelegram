export const removeMessageSession = async (telegramId: number, messageId: number) => {
    if (!telegramId || !messageId) return;

    await $fetch('/api/bot/session/removeMessageSession', {
        method: 'POST',
        body: {
            telegram_id: telegramId,
            message_id: messageId,
        }
    })
}
