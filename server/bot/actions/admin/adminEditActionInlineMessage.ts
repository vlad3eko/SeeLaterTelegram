
import {engineRichCard} from "#server/global/engine/card/engineRichCard";
import type {AdminEditSession} from "#server/bot/actions/admin/adminEditSession";

export const adminEditActionInlineMessage = async (
    ctx: any,
    session: AdminEditSession
) => {

    if (session.mode === 'media') {
        const photo = ctx.message.photo?.at(-1)
        const video = ctx.message.video

        if (!photo && !video) return

        const newMedia = photo
            ? {
                type: 'photo' as const,
                fileId: photo.file_id
            }
            : {
                type: 'video' as const,
                fileId: video.file_id
            }

        session.currentMedia = newMedia

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
                    mediaOverride: newMedia
                }
            )

            session.mode = undefined
        } catch (error) {
            console.error('EDIT MEDIA ERROR:', error)
        }

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
}
