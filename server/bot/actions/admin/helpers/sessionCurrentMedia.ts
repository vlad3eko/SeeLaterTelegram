import type { AdminEditSession } from "#server/bot/actions/admin/adminEditSession"
import { engineAdminEditCard } from "#server/bot/actions/admin/helpers/engineAdminEditCard"

export const sessionCurrentMedia = async (
    ctx: any,
    session: AdminEditSession,
    mediaOverride?: { type: 'photo' | 'video'; fileId: string }
) => {
    const photo = ctx.message?.photo?.at(-1)
    const video = ctx.message?.video

    const newMedia = mediaOverride ?? (
        photo
            ? { type: 'photo' as const, fileId: photo.file_id }
            : video
                ? { type: 'video' as const, fileId: video.file_id }
                : null
    )

    if (!newMedia) {
        return
    }

    session.currentMedia = newMedia

    try {
        await engineAdminEditCard(ctx, session, {
            id: session.mediaId,
            type: session.mediaType,
            status: 'ready',
            contentType: session.contentType,
            addComment: session.comment,
            addOverview: session.overview,
            keyTrailer: session.keyTrailer,
            mediaOverride: newMedia
        })
    } catch (error) {
        console.error('EDIT MEDIA ERROR:', error)
    }
}
