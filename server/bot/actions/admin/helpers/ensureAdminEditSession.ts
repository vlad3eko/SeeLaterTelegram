import {getAdminEditSession, setAdminEditSession, updateAdminEditSession, type AdminEditSession} from "#server/bot/actions/admin/adminEditSession"
import {internalTmdbFetch} from "#server/utils/api/internalFetch"
import {NOTIFICATION_MESSAGE} from "#server/global/notifications/sendNotificationMessage"
import {getTelegramMediaImages} from "#server/global/engine/card/construct/getTelegramPosterFileId"
import {ADMIN_EDIT_CARD} from "#server/bot/callbacks/routes"

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

    // Ключ без значения (`none`, в старых кнопках `undefined`) разбирается как undefined.
    const {mediaId: parsedMediaId, mediaType, contentType, keyTrailer} = ADMIN_EDIT_CARD.parse(ctx)

    if (!Number.isFinite(parsedMediaId)) {
        await ctx.answerCbQuery(NOTIFICATION_MESSAGE.CbQ.ErrorProcessSession)
        return null
    }

    const session = await getAdminEditSession(ctx.from.id)
    const isCurrentSession =
        session &&
        session.mediaId === parsedMediaId &&
        session.mediaType === mediaType &&
        session.contentType === contentType &&
        (isInlineMessage
            ? session.inlineMessageId === inlineMessageId
            : session.inlineMessageId == null &&
            String(session.chatId) === String(chatId) &&
            session.messageId === messageId)

    if (isCurrentSession) {
        if (keyTrailer !== undefined && session.keyTrailer !== keyTrailer) {

            // Ключ пришёл из кнопки карточки, а не введён вручную: ручная проверка Reel не нужна.
            session.keyTrailer = keyTrailer || undefined
            session.preparedInstagram = undefined
            session.trailerKeySource = undefined
            session.videoType = undefined

            await updateAdminEditSession(ctx.from.id, {
                    keyTrailer: keyTrailer || null,
                    preparedInstagram: null,
                    trailerKeySource: null,
                    videoType: null
                })
        }
        return session
    }

    const media = await internalTmdbFetch(
        "/api/bot/getMediaBot",
        {
            query: {
                media: mediaType,
                id: parsedMediaId
            }
        }
    )

    const telegramImages = await getTelegramMediaImages(ctx, parsedMediaId, mediaType, {
            poster: [
                media.poster_path ||
                media.backdrop_path
            ],
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
        keyTrailer: keyTrailer || undefined,
        comment: undefined,
        overview: undefined,
        mode: undefined,
        currentMedia: {
            type: 'photo',
            fileId: telegramImages.poster[0]!
        }
    }

    await setAdminEditSession(ctx.from.id, newSession)
    return newSession
}
