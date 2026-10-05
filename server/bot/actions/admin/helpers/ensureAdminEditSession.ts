import { getAdminEditSession, setAdminEditSession, type AdminEditSession } from "#server/bot/actions/admin/adminEditSession"
import { tmdbFetch } from "#server/utils/api/tmdbFetch"
import { NOTIFICATION_MESSAGE } from "#server/global/notifications/sendNotificationMessage"
import { getTelegramMediaImages } from "#server/global/engine/card/construct/getTelegramPosterFileId"

export const ensureAdminEditSession = async (ctx: any): Promise<AdminEditSession | null> => {
    const inlineMessageId = ctx.callbackQuery?.inline_message_id
    const message = ctx.callbackQuery?.message
    const chatId = message?.chat?.id
    const messageId = message?.message_id

    const isInlineMessage = Boolean(inlineMessageId)
    const isRegularMessage = chatId !== undefined && messageId !== undefined

    if (!isInlineMessage && !isRegularMessage) {
        await ctx.answerCbQuery(NOTIFICATION_MESSAGE.CbQ.ErrorProcessSession)
        return null
    }

    const [, mediaId, mediaType, contentType, keyTrailer] = ctx.match
    const parsedMediaId = Number(mediaId)
    const session = getAdminEditSession(ctx.from.id)

    const isCurrentSession = session &&
        session.mediaId === parsedMediaId &&
        (isInlineMessage
            ? session.inlineMessageId === inlineMessageId
            : session.chatId === chatId && session.messageId === messageId)

    if (isCurrentSession) {
        return session
    }

    const media = await tmdbFetch("/api/bot/getMediaBot", {
        query: { media: mediaType, id: parsedMediaId }
    })

    const telegramImages = await getTelegramMediaImages(ctx, parsedMediaId, mediaType, {
        poster: [media.poster_path || media.backdrop_path],
        postersList: []
    })

    const newSession: AdminEditSession = {
        inlineMessageId: inlineMessageId ?? undefined,
        chatId: chatId ?? undefined,
        messageId: messageId ?? undefined,
        mediaId: parsedMediaId,
        mediaType,
        media,
        contentType,
        keyTrailer,
        comment: undefined,
        overview: undefined,
        mode: undefined,
        currentMedia: {
            type: 'photo',
            fileId: telegramImages.poster[0]!
        }
    }

    setAdminEditSession(ctx.from.id, newSession)

    return newSession
}
