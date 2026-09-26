import {engineRichCard} from "#server/global/engine/card/engineRichCard";
import type {AdminEditSession} from "#server/bot/actions/admin/adminEditSession";
import {prepareReel} from "#server/global/engine/instagram/prepareReel";
import {createInstagramHook} from "#server/global/engine/instagram/reel/caption/getInstagramMediaType";
import {sessionCurrentMedia} from "#server/bot/actions/admin/helpers/sessionCurrentMedia";

export const adminEditActionInlineMessage = async (
    ctx: any,
    session: AdminEditSession
) => {

    if (session.mode === 'media') {
        await sessionCurrentMedia(ctx, session)

        session.mode = undefined
        return

    }

    if (session.mode === 'text') {
        const text = ctx.message.text
        if (!text) return

        try {
            await engineRichCard(
                {
                    ctx,
                    inlineMessageId: session.inlineMessageId,
                    isAdmin: true
                },
                {
                    id: session.mediaId,
                    type: session.mediaType,
                    status: 'ready',
                    contentType: session.contentType,
                    addComment: text,
                    addOverview: session.overview,
                    keyTrailer: session.keyTrailer,
                    mediaOverride: session.currentMedia
                }
            )

            session.comment = text
            session.mode = undefined
        } catch (error) {
            console.error('EDIT CAPTION ERROR:', error)
        }

        return
    }

    if (session.mode === 'overview') {
        const overview = ctx.message.text
        if (!overview) return

        try {
            await engineRichCard(
                {
                    ctx,
                    inlineMessageId: session.inlineMessageId,
                    isAdmin: true
                },
                {
                    id: session.mediaId,
                    type: session.mediaType,
                    status: 'ready',
                    contentType: session.contentType,
                    addComment: session.comment,
                    addOverview: overview,
                    keyTrailer: session.keyTrailer,
                    mediaOverride: session.currentMedia
                }
            )

            session.overview = overview
            session.mode = undefined
        } catch (error) {
            console.error('EDIT OVERVIEW ERROR:', error)
        }

        return
    }

    if (session.mode === 'type') {
        try {
            await engineRichCard(
                {
                    ctx,
                    inlineMessageId: session.inlineMessageId,
                    isAdmin: true
                },
                {
                    id: session.mediaId,
                    type: session.mediaType,
                    status: 'ready',
                    contentType: session.contentType,
                    addComment: session.comment,
                    addOverview: session.overview,
                    keyTrailer: session.keyTrailer,
                    mediaOverride: session.currentMedia
                }
            )

            session.mode = undefined
        } catch (error) {
            console.error('EDIT TYPE CARD ERROR:', error)
        }

        return
    }

    if (session.mode === 'download') {

        const [, keyTrailer] =
            ctx.message.text.split('=')

        if (!keyTrailer)
            await ctx.reply('Не удалось определить keyTrailer')


        session.keyTrailer = keyTrailer

        const instagramHook =
            createInstagramHook(
                session.mediaType,
                session.contentType
            )

        const prepared =
            await prepareReel(
                keyTrailer,
                instagramHook,
                ctx,
                {id: session.mediaId, type: session.mediaType},
                session.mode
            )

        if (!prepared.telegramFileId)
            await ctx.reply('Не удалось получить Telegram file_id')

        session.preparedInstagram = {
            keyTrailer,
            reelR2: prepared.reelR2,
            telegramFileId: prepared.telegramFileId
        }

        session.mode = undefined
        return
    }
}
