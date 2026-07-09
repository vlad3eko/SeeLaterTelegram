export const addMessageSession = async (
    telegramId: number,
    type: string,
    options?: {
        messageId?: number
        inlineMessageId?: string
    }
) => {

    if (!telegramId) return

    if (!options?.messageId && !options?.inlineMessageId) {
        return
    }

    await $fetch('/api/bot/session/addMessageSession', {
        method: 'POST',
        body: {
            telegram_id: telegramId,
            message_id: options?.messageId ?? null,
            inline_message_id: options?.inlineMessageId ?? null,
            type
        }
    })

}
