export const deleteOldMessagesSession = async (telegramId: any) => {
    await $fetch('/api/bot/session/deleteOldMessagesSession', {
        method: 'POST',
        telegram_id: telegramId
    })
}
