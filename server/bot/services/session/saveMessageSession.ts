export const saveMessageSession = async (
    telegramId: number,
    messageId: number
) => {

    if (!telegramId || !messageId) return;

    await $fetch('/api/bot/session/saveMessageSession', {
        method: 'POST',
        body: {
            telegram_id: telegramId,
            message_id: messageId
        }
    });
};
