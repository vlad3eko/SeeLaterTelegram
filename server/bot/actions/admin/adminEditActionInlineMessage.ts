import {
    type AdminEditSession,
    updateAdminEditSession
} from "#server/bot/actions/admin/adminEditSession"

import {prepareReel} from "#server/global/engine/instagram/reel/prepareReel"
import {createInstagramHook} from "#server/global/engine/instagram/reel/caption/getInstagramMediaType"
import {sessionCurrentMedia} from "#server/bot/actions/admin/helpers/sessionCurrentMedia"
import {engineAdminEditCard} from "#server/bot/actions/admin/helpers/engineAdminEditCard"
import {extractYouTubeVideoId} from "#server/global/engine/instagram/reel/utils/extractYouTubeVideoId";
import {NOTIFICATION_MESSAGE} from "#server/global/notifications/sendNotificationMessage";
import {addMessageSession} from "#server/bot/services/session/addMessageSession";
import {SessionMessageType} from "#server/bot/consts/types/SessionMessageTypes";

export const adminEditActionInlineMessage = async (ctx: any, session: AdminEditSession) => {

    switch (session.mode) {
        case "media": {

            const hasPhoto = Boolean(ctx.message?.photo)
            const hasVideo = Boolean(ctx.message?.video)

            if (!hasPhoto && !hasVideo)
                return

            try {
                await sessionCurrentMedia(ctx, session)
                await updateAdminEditSession(ctx.from.id, {
                    currentMedia:
                    session.currentMedia,

                    mode:
                        null
                })

            } catch (error) {

                console.error('EDIT MEDIA ERROR:', error)
            }

            return
        }
        case 'text': {

        const text = ctx.message?.text

        if (!text)
            return

        try {

            await engineAdminEditCard(ctx, session, {
                    id: session.mediaId,
                    type: session.mediaType,
                    status: 'ready',
                    contentType: session.contentType,
                    addComment: text,
                    addOverview: session.overview,
                    keyTrailer: session.keyTrailer,
                    mediaOverride: session.currentMedia
                })
            await updateAdminEditSession(ctx.from.id, {
                    comment: text,
                    mode: null
                })

        } catch (error) {

            console.error('EDIT CAPTION ERROR:', error)
        }

        return
    }
        case 'overview': {

        const overview = ctx.message?.text

        if (!overview)
            return

        try {

            await engineAdminEditCard(ctx, session, {
                    id: session.mediaId,
                    type: session.mediaType,
                    status: 'ready',
                    contentType: session.contentType,
                    addComment: session.comment,
                    addOverview: overview,
                    keyTrailer: session.keyTrailer,
                    mediaOverride: session.currentMedia
                })
            await updateAdminEditSession(ctx.from.id, {
                    overview,
                    mode: null
                })

        } catch (error) {

            console.error('EDIT OVERVIEW ERROR:', error)
        }

        return
    }
        case 'type': {

        try {

            await engineAdminEditCard(ctx, session, {
                    id: session.mediaId,
                    type: session.mediaType,
                    status: 'ready',
                    contentType: session.contentType,
                    addComment: session.comment,
                    addOverview: session.overview,
                    keyTrailer: session.keyTrailer,
                    mediaOverride: session.currentMedia
                })
            await updateAdminEditSession(ctx.from.id, {
                    mode: null
                })

        } catch (error) {

            console.error('EDIT TYPE CARD ERROR:', error)
        }

        return
    }
        case 'download': {

        const text = ctx.message?.text
        let message

        if (!text)
            return

        const [, keyTrailer] = text.split('=')

        if (!keyTrailer) {
            message = await ctx.reply('Не удалось определить keyTrailer')
            await addMessageSession(ctx.from.id, SessionMessageType.Error, {messageId: message.message_id})
            return
        }

        const instagramHook = createInstagramHook(session.mediaType, session.contentType)

        try {

            console.log('[ADMIN EDIT DISPATCH]', {
                updateId: ctx.update?.update_id,
                messageId: ctx.message?.message_id,
                userId: ctx.from?.id,
                mode: session?.mode,
                text: ctx.message?.text?.slice(0, 100)
            })

            await updateAdminEditSession(ctx.from.id, {
                    keyTrailer,
                    preparedInstagram: null
                })

            const prepared = await prepareReel(keyTrailer, instagramHook, ctx, {
                        id: session.mediaId,
                        type: session.mediaType,
                        title: session.media.title || session.media.name
                    },
                    'download'
                )

            if (!prepared.telegramFileId) {
                await updateAdminEditSession(ctx.from.id, {mode: null})
                message = await ctx.reply('Не удалось получить Telegram file_id')
                await addMessageSession(ctx.from.id, SessionMessageType.Error, {messageId: message.message_id})
                return
            }



            const preparedInstagram = {
                keyTrailer,
                reelR2: prepared.reelR2,
                telegramFileId: prepared.telegramFileId
            }

            await updateAdminEditSession(ctx.from.id, {
                    preparedInstagram,
                    mode: null
                })

        } catch (error) {

            console.error('DOWNLOAD TRAILER ERROR:', error)
            await updateAdminEditSession(ctx.from.id, {
                    mode: null
                })
        }

        return
    }
        case 'trailer': {

            const text = ctx.message?.text?.trim()
            await addMessageSession(ctx.from.id, SessionMessageType.Text, {messageId: text.message_id})
            let message

            if (!text) {
                message = await ctx.reply(NOTIFICATION_MESSAGE.reply.SendLinkTrailer)
                await addMessageSession(ctx.from.id, SessionMessageType.Success, {messageId: message.message_id})
                return
            }

            const keyTrailer = extractYouTubeVideoId(text)

            if (!keyTrailer) {
                message = await ctx.reply(NOTIFICATION_MESSAGE.reply.ErrorTrailerTryAgain)
                await addMessageSession(ctx.from.id, SessionMessageType.Error, {messageId: message.message_id})
                return
            }

            try {
                // Сначала сохраняем новый ключ в Supabase.
                // Старый подготовленный Reel больше использовать нельзя.
                await updateAdminEditSession(ctx.from.id, {
                    keyTrailer,
                    preparedInstagram: null,
                    mode: null,
                    publishStartedAt: null
                })

            } catch (error) {
                console.error(
                    '[SAVE TRAILER KEY ERROR]',
                    error
                )

                message = await ctx.reply(NOTIFICATION_MESSAGE.reply.ErrorTrailerKey)
                await addMessageSession(ctx.from.id, SessionMessageType.Error, {messageId: message.message_id})
                return
            }

            // Синхронизируем локальный объект с Supabase.
            session.keyTrailer = keyTrailer
            session.preparedInstagram = undefined
            session.mode = undefined
            session.publishStartedAt = undefined

            try {
                await engineAdminEditCard(ctx, session, {
                    id: session.mediaId,
                    type: session.mediaType,
                    status: 'ready',
                    contentType: session.contentType,
                    addComment: session.comment,
                    addOverview: session.overview,
                    keyTrailer,
                    mediaOverride: session.currentMedia
                })

            } catch (error) {
                console.error('[UPDATE CARD TRAILER KEY ERROR]', error)
                message = await ctx.reply(NOTIFICATION_MESSAGE.reply.ErrorUpdateCard)
                await addMessageSession(ctx.from.id, SessionMessageType.Error, {messageId: message.message_id})

                return
            }

            message = await ctx.reply(NOTIFICATION_MESSAGE.reply.SuccessTrailerUpdated)
            await addMessageSession(ctx.from.id, SessionMessageType.Success, {messageId: message.message_id})
            return
        }

        default:
            return
    }
}
