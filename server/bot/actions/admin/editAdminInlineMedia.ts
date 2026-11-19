import {editMediaChoiceKeyboard} from "#server/bot/consts/buttons/admin/keyboardAdmin"
import {NOTIFICATION_MESSAGE} from "#server/global/notifications/sendNotificationMessage"
import {engineAdminEditCard} from "#server/bot/actions/admin/helpers/engineAdminEditCard"
import {ensureAdminEditSession} from "#server/bot/actions/admin/helpers/ensureAdminEditSession"

export const editAdminInlineMedia = async (ctx: any) => {

    const session =
        await ensureAdminEditSession(ctx)

    if (!session)
        return

    try {

        await engineAdminEditCard(
            ctx,
            session,
            {
                id: session.mediaId,
                type: session.mediaType,
                status: 'ready',
                contentType: session.contentType,
                // Правки из сессии: без них повторное «Редактировать» рисовало карточку
                // с исходным описанием TMDB, и изменённое описание пропадало.
                addComment: session.comment,
                addOverview: session.overview,
                keyTrailer: session.keyTrailer,
                mediaOverride: session.currentMedia
            }
        )

        await ctx.editMessageReplyMarkup(editMediaChoiceKeyboard())
        await ctx.answerCbQuery(NOTIFICATION_MESSAGE.CbQ.SuccessProcessEditCard)

    } catch (error) {

        console.error('[ERROR editAdminInlineMedia]', error)
        await ctx.answerCbQuery(NOTIFICATION_MESSAGE.CbQ.ErrorProcessSession)
    }
}
