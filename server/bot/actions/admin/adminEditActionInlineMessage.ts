import {
    clearAdminEditSession,
    getAdminEditSession
} from "#server/bot/actions/admin/adminEditSession";

import {createMediaCaption}
    from "#server/bot/consts/media/createMediaCaption";

import {
    keyboardSendMediaCardInline
} from "#server/bot/consts/buttons/keyboardBot";


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
                    session.contentType
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


        clearAdminEditSession(ctx.from.id)

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


        await ctx.telegram.editMessageCaption(

            undefined,
            undefined,
            session.inlineMessageId,

            text,

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


        clearAdminEditSession(ctx.from.id)

        return
    }


    clearAdminEditSession(ctx.from.id)
}
