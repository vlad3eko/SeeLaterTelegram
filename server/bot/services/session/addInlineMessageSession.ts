export const addInlineMessageSession = async (
    telegramId: number,
    inlineMessageId: string,
    type: string
) => {

    if (!telegramId || !inlineMessageId) return

    await $fetch('/api/bot/session/addMessageSession', {
        method: 'POST',
        body: {
            telegram_id: telegramId,
            message_id: null,
            inline_message_id: inlineMessageId,
            type
        }
    })

}
