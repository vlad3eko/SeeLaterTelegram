import {keyboardSendMediaCardInline} from "#server/bot/consts/buttons/keyboardBot";
import {createMediaCaption} from "#server/bot/consts/media/createMediaCaption";
import type {AdminEditSession} from "#server/bot/actions/admin/adminEditSession";

export const adminEditActionInlineMessage = async (ctx: any, session: AdminEditSession) => {
    console.log(
        'EDIT ACTION START',
        {
            mode: session.mode,
            text: ctx.message?.text,
            messageId: ctx.message?.message_id
        }
    )
    // =========================
    // НОВОЕ МЕДИА
    // =========================

    if (session.mode === 'media') {

        console.log(
            'COMMENT BEFORE MEDIA CHANGE:',
            session.comment
        )

        const photo =
            ctx.message.photo?.at(-1)

        const video =
            ctx.message.video


        if (!photo && !video)
            return


        const newMedia = photo
            ? {
                type: 'photo' as const,
                fileId: photo.file_id
            }
            : {
                type: 'video' as const,
                fileId: video.file_id
            }


        const caption =
            createMediaCaption(
                session.media,
                session.contentType,
                session.comment
            )

        await ctx.telegram.editMessageMedia(
            undefined,
            undefined,
            session.inlineMessageId,

            {
                type: newMedia.type,
                media: newMedia.fileId,
                caption,
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

        session.currentMedia =
            newMedia

        session.currentCaption =
            caption
        console.log(
            'RESET ADMIN MODE'
        )
        session.mode =
            undefined

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

        console.log('TEXT:', text)

        const caption =
            createMediaCaption(
                session.media,
                session.contentType,
                text
            )

        console.log('CAPTION CREATED')

        try {

            await ctx.telegram.editMessageCaption(
                undefined,
                undefined,
                session.inlineMessageId,
                caption,
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

            console.log('CAPTION EDITED SUCCESSFULLY')

            session.comment =
                text

            session.currentCaption =
                caption
            console.log(
                'RESET ADMIN MODE'
            )
            session.mode =
                undefined

            console.log('SESSION UPDATED')

        } catch (error) {

            console.error(
                'EDIT CAPTION ERROR:',
                error
            )
        }

        return
    }
}
