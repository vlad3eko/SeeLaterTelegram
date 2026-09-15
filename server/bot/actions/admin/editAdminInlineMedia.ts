import {getAdminEditSession, setAdminEditSession} from "#server/bot/actions/admin/adminEditSession"
import {tmdbFetch} from "#server/utils/api/tmdbFetch"
import {editMediaChoiceKeyboard} from "#server/bot/consts/buttons/admin/keyboardAdmin";
import {NOTIFICATION_MESSAGE} from "#server/global/notifications/sendNotificationMessage";
import {engineRichCard} from "#server/global/engine/card/engineRichCard";

export const editAdminInlineMedia = async (ctx: any) => {

    const inlineMessageId =
        ctx.callbackQuery.inline_message_id

    if (!inlineMessageId) {
        await ctx.answerCbQuery(
            NOTIFICATION_MESSAGE.CbQ.ErrorProcessSession
        )
        return
    }

    const [
        ,
        mediaId,
        mediaType,
        contentType,
        keyTrailer
    ] = ctx.match

    const parsedMediaId =
        Number(mediaId)

    const session =
        getAdminEditSession(ctx.from.id)

    const isCurrentSession =
        session &&
        session.inlineMessageId === inlineMessageId &&
        session.mediaId === parsedMediaId

    if (!isCurrentSession) {
        const media =
            await tmdbFetch(
                "/api/bot/getMediaBot",
                {
                    query: {
                        media: mediaType,
                        id: parsedMediaId
                    }
                }
            )

        setAdminEditSession(
            ctx.from.id,
            {
                inlineMessageId,
                mediaId: parsedMediaId,
                mediaType,
                media,
                contentType,
                keyTrailer,
                comment: undefined,
                overview: undefined,
                mode: undefined,
                currentMedia: {
                    type: "photo",
                    fileId:
                        `https://image.tmdb.org/t/p/original${
                            media.poster_path ||
                            media.backdrop_path
                        }`
                }
            }
        )
    }

    try {

        await engineRichCard(
            {
                ctx,
                inlineMessageId,
                isAdmin: true
            },
            {
                id: parsedMediaId,
                type: mediaType,
                status: 'ready',
                contentType,
                keyTrailer,
                mediaOverride:
                getAdminEditSession(ctx.from.id)?.currentMedia
            }
        )


        await ctx.editMessageReplyMarkup(
            editMediaChoiceKeyboard()
        )


    } catch (e) {
        console.log('[ERROR editAdminInlineMedia: ]', e)
    }

    await ctx.answerCbQuery(
        NOTIFICATION_MESSAGE.CbQ.SuccessProcessEditCard
    )
}
