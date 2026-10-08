import type {AdminEditSession} from "#server/bot/actions/admin/adminEditSession"

export const isAdminEditSessionForContext = (
    ctx: any,
    session: AdminEditSession,
    mediaId: number,
    mediaType: 'movie' | 'tv',
    contentType: string
) => {

    if (
        session.mediaId !== mediaId ||
        session.mediaType !== mediaType ||
        session.contentType !== contentType
    ) {
        return false
    }

    const inlineMessageId =
        ctx.callbackQuery?.inline_message_id

    if (inlineMessageId) {
        return session.inlineMessageId === inlineMessageId
    }

    const chatId = ctx.callbackQuery?.message?.chat?.id
    const messageId = ctx.callbackQuery?.message?.message_id

    return (
        session.inlineMessageId == null &&
        String(session.chatId) === String(chatId) &&
        session.messageId === messageId
    )
}
