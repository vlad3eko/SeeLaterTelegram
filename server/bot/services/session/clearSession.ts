export const clearSession = async (telegramId: number) => {
    if (!telegramId) return

    await $fetch('/api/bot/session/editClearSession', {
        method: 'POST',
        body: {
            telegram_id: telegramId
        }
    })
}
