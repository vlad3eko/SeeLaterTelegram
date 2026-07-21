import {keyboardSendMediaCardInline} from "#server/bot/consts/buttons/keyboardBot";
import {createMediaCaption} from "#server/bot/consts/media/createMediaCaption";
import {getAdminEditSession} from "#server/bot/actions/admin/adminEditSession";

export const adminEditActionInlineMessage = async (ctx: any) => {

    const session =
        getAdminEditSession(ctx.from.id)


    if (!session)
        return


    // =========================
    // НОВОЕ МЕДИА
    // =========================

    if (session.mode === 'media') {

        const photo =
            ctx.message.photo?.at(-1)


        if (!photo)
            return


        await ctx.telegram.editMessageMedia(
            undefined,
            undefined,
            session.inlineMessageId,

            {
                type: 'photo',
                media: photo.file_id,

                caption: createMediaCaption(
                    session.media,
                    session.contentType,
                    session.comment
                ),

                parse_mode: 'HTML'
            },

            {
                reply_markup:
                    keyboardSendMediaCardInline(
                        session.mediaId,
                        session.mediaType,
                        session.contentType,
                        session.media.genres,
                        true
                    )
            }
        )


        session.mode = undefined

        return
    }


    // =========================
    // НОВЫЙ ТЕКСТ
    // =========================

    if (session.mode === 'text') {

        const text =
            ctx.message.text


        if (!text)
            return


        session.comment = text


        await ctx.telegram.editMessageCaption(
            undefined,
            undefined,
            session.inlineMessageId,

            createMediaCaption(
                session.media,
                session.contentType,
                session.comment
            ),

            {
                parse_mode: 'HTML',

                reply_markup:
                    keyboardSendMediaCardInline(
                        session.mediaId,
                        session.mediaType,
                        session.contentType,
                        session.media.genres,
                        true
                    )
            }
        )


        session.mode = undefined

        return
    }
}
