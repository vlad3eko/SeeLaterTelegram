import {getAdminEditSession, setAdminEditSession} from "#server/bot/actions/admin/adminEditSession";
import {editMediaChoiceKeyboard} from "#server/bot/consts/buttons/keyboardBot";
import {createMediaCaption} from "#server/bot/consts/media/createMediaCaption";

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
        contentType
    ] = ctx.match


    const media = await $fetch(
        '/api/bot/getMediaBot',
        {
            query: {
                media: mediaType,
                id: mediaId
            }
        }
    )

        setAdminEditSession(
            ctx.from.id,
            {
                inlineMessageId,

                mediaId: Number(mediaId),
                mediaType,

                media,

                contentType,

                comment: undefined,

                mode: undefined,

                currentMedia: {
                    type: 'photo',
                    fileId: `https://image.tmdb.org/t/p/w500${
                        media.poster_path || media.backdrop_path
                    }`
                },

                currentCaption: createMediaCaption(
                    media,
                    contentType
                )
            }
        )

    await ctx.editMessageReplyMarkup(
        editMediaChoiceKeyboard()
    )

    await ctx.answerCbQuery()
}
