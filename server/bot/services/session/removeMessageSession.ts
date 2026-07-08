export const removeMessageSession = async (
    telegramId: number,
    options: {
        messageId?: number
        inlineMessageId?: string
    }
) => {

    if (!telegramId) return

    await $fetch('/api/bot/session/removeMessageSession', {
        method: 'POST',
        body: {
            telegram_id: telegramId,
            message_id: options.messageId ?? null,
            inline_message_id: options.inlineMessageId ?? null
        }
    })

}
