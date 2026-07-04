export const getSession = async (telegramId: number) => {
    if (!telegramId) return

    await $fetch('/api/bot/session/editGetSession', {
        method: 'POST',
        body: {
            telegram_id: telegramId
        }
    })
}
