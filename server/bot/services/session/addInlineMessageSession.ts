export const addInlineMessageSession = async (
    telegramId: number,
    messageId: number,
    type: string
) => {

    if (!telegramId || !messageId) return

    await $fetch('/api/bot/session/addMessageSession', {
        method: 'POST',
        body: {
            telegram_id: telegramId,
            message_id: messageId,
            inline_message_id: null,
            type
        }
    })

}
