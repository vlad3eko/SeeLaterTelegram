import {setAdminEditSession} from "#server/bot/actions/admin/adminEditSession";
import {editMediaChoiceKeyboard} from "#server/bot/consts/buttons/keyboardBot";

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
            mode: 'media'
        }
    )

    await ctx.editMessageReplyMarkup(
        editMediaChoiceKeyboard()
    )

    await ctx.answerCbQuery()
}
