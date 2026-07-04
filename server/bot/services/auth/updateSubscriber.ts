export const updateSubscriber = async (telegramId: number, isSubscriber: boolean) => {
    await $fetch('/api/auth/subscriber', {
        method: 'POST',
        body: {
            telegram_id: telegramId,
            isSubscriber
        }
    })
}
