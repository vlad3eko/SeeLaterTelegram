import type {AdminEditSession} from "#server/bot/actions/admin/adminEditSession"

export const getAdminEditTarget = (session: AdminEditSession) => {
    if (session.inlineMessageId) {
        return {
            inlineMessageId: session.inlineMessageId,
            chatId: undefined,
            messageId: undefined
        }
    }

    if (session.chatId !== undefined && session.messageId !== undefined) {
        return {
            inlineMessageId: undefined,
            chatId: session.chatId,
            messageId: session.messageId
        }
    }

    return null
}
