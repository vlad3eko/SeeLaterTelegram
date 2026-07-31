import {
    getAdminEditSession,
    setAdminEditSession
} from "#server/bot/actions/admin/adminEditSession"

import {
    editMediaChoiceKeyboard
} from "#server/bot/consts/buttons/keyboardBot"

import {
    createMediaCaption
} from "#server/bot/consts/media/createMediaCaption"

import {
    tmdbFetch
} from "#server/utils/api/tmdbFetch"

export const editAdminInlineMedia = async (ctx: any) => {

    const inlineMessageId =
        ctx.callbackQuery.inline_message_id

    if (!inlineMessageId) {
        await ctx.answerCbQuery()
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

                mediaId:
                parsedMediaId,

                mediaType,

                media,

                contentType,

                keyTrailer,

                comment:
                undefined,

                overview:
                undefined,

                mode:
                undefined,

                currentMedia: {

                    type:
                        "photo",

                    fileId:
                        `https://image.tmdb.org/t/p/w500${
                            media.poster_path ||
                            media.backdrop_path
                        }`
                },

                currentCaption:
                    createMediaCaption(
                        media,
                        contentType,
                        undefined,
                        undefined,
                        keyTrailer
                    )
            }
        )
    }

    await ctx.editMessageReplyMarkup(
        editMediaChoiceKeyboard()
    )

    await ctx.answerCbQuery()
}
