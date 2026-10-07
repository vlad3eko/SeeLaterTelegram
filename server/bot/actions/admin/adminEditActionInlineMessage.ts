import {type AdminEditSession, updateAdminEditSession} from "#server/bot/actions/admin/adminEditSession"
import { prepareReel } from "#server/global/engine/instagram/prepareReel"
import { createInstagramHook } from "#server/global/engine/instagram/reel/caption/getInstagramMediaType"
import { sessionCurrentMedia } from "#server/bot/actions/admin/helpers/sessionCurrentMedia"
import { engineAdminEditCard } from "#server/bot/actions/admin/helpers/engineAdminEditCard"

export const adminEditActionInlineMessage = async (ctx: any, session: AdminEditSession) => {
    if (session.mode === 'media') {
        await sessionCurrentMedia(ctx, session)
        await updateAdminEditSession(ctx.from.id, {mode: null})
        session.mode = undefined
        return
    }

    if (session.mode === 'text') {
        const text = ctx.message?.text
        if (!text) return

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

            await updateAdminEditSession(ctx.from.id, {comment: text})
            session.comment = text

            await updateAdminEditSession(ctx.from.id, {mode: null})
            session.mode = undefined
        } catch (error) {
            console.error('EDIT CAPTION ERROR:', error)
        }
        return
    }

    if (session.mode === 'overview') {
        const overview = ctx.message?.text
        if (!overview) return

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

            await updateAdminEditSession(ctx.from.id, {overview})
            session.overview = overview

            await updateAdminEditSession(ctx.from.id, {mode: null})
            session.mode = undefined
        } catch (error) {
            console.error('EDIT OVERVIEW ERROR:', error)
        }
        return
    }

    if (session.mode === 'type') {
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

            await updateAdminEditSession(ctx.from.id, {mode: null})
            session.mode = undefined

        } catch (error) {
            console.error('EDIT TYPE CARD ERROR:', error)
        }
        return
    }

    if (session.mode === 'download') {
        const text = ctx.message?.text
        if (!text) return

        const [, keyTrailer] = text.split('=')
        if (!keyTrailer) {
            await ctx.reply('Не удалось определить keyTrailer')
            return
        }

        await updateAdminEditSession(ctx.from.id, {keyTrailer})
        session.keyTrailer = keyTrailer

        const instagramHook = createInstagramHook(session.mediaType, session.contentType)
        const prepared = await prepareReel(keyTrailer, instagramHook, ctx, {
            id: session.mediaId,
            type: session.mediaType
        }, session.mode)

        if (!prepared.telegramFileId) {
            await ctx.reply('Не удалось получить Telegram file_id')
            return
        }

        session.preparedInstagram = {
            keyTrailer,
            reelR2: prepared.reelR2,
            telegramFileId: prepared.telegramFileId
        }

        await updateAdminEditSession(ctx.from.id, {mode: null})
        session.mode = undefined
        return
    }
}
