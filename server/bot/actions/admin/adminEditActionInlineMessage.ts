import {
    type AdminEditSession,
    updateAdminEditSession
} from "#server/bot/actions/admin/adminEditSession"

import {prepareReel} from "#server/global/engine/instagram/reel/prepareReel"
import {createInstagramHook} from "#server/global/engine/instagram/reel/caption/getInstagramMediaType"
import {sessionCurrentMedia} from "#server/bot/actions/admin/helpers/sessionCurrentMedia"
import {engineAdminEditCard} from "#server/bot/actions/admin/helpers/engineAdminEditCard"
import {extractYouTubeVideoId} from "#server/global/engine/instagram/reel/utils/extractYouTubeVideoId";

export const adminEditActionInlineMessage = async (
    ctx: any,
    session: AdminEditSession
) => {

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

        if (!text)
            return

        const [, keyTrailer] = text.split('=')

        if (!keyTrailer) {
            await ctx.reply('Не удалось определить keyTrailer')
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
                        type: session.mediaType
                    },
                    'download'
                )

            if (!prepared.telegramFileId) {
                await updateAdminEditSession(ctx.from.id, {mode: null})
                await ctx.reply('Не удалось получить Telegram file_id')
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

            if (!text) {
                await ctx.reply('Отправь ссылку на YouTube или ID ролика.')
                return
            }

            const keyTrailer = extractYouTubeVideoId(text)

            if (!keyTrailer) {
                await ctx.reply(
                    'Не удалось определить ID YouTube-ролика.\n\n' +
                    'Отправь ссылку вида https://www.youtube.com/watch?v=ID ' +
                    'или ID из 11 символов.'
                )
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

                await ctx.reply(
                    'Не удалось сохранить новый ключ. Попробуй ещё раз.'
                )
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
                await ctx.reply('Новый ключ сохранён, но не удалось обновить карточку. ' + 'Открой редактирование карточки ещё раз.')
                return
            }

            await ctx.reply(
                `Ключ трейлера обновлён: ${keyTrailer}\n\n` +
                'Теперь нажми кнопку публикации на обновлённой карточке.'
            )

            return
        }

        default:
            return
    }
}
