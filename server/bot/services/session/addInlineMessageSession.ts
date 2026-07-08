export const addInlineMessageSession = async (
    telegramId: number,
    inlineMessageId: string,
    type: string
) => {

    if (!telegramId || !inlineMessageId) return

    await $fetch('/api/bot/session/addInlineMessageSession', {
        method: 'POST',
        body: {
            telegram_id: telegramId,
            inline_message_id: inlineMessageId,
            type
        }
    })
}
