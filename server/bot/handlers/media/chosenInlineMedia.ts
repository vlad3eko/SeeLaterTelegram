import {SessionMessageType} from "#server/bot/consts/types/SessionMessageTypes";
import {addMessageSession} from "#server/bot/services/session/addMessageSession";
import {createMediaCaption} from "#server/bot/consts/media/createMediaCaption";
import {keyboardSendMediaCardInline} from "#server/bot/consts/buttons/keyboardBot";

export const chosenInlineMedia = async (ctx: any) => {

    console.log('start')
    try {
        const result = ctx.chosenInlineResult
        console.log('result', result)

        const inlineMessageId =
            result.inline_message_id

        const resultId =
            result.result_id

        if (!inlineMessageId || !resultId)
            return

        const [
            type,
            id
        ] = resultId.split('_')
        console.log('type, id', type, id)

        const media = await $fetch('/api/bot/getMediaBot', {
            query: {
                id: id,
                media: type
            }
        })
        console.log('media')

        await new Promise(resolve => setTimeout(resolve, 300))

        await ctx.telegram.editMessageMedia(
            undefined,
            undefined,
            inlineMessageId,
            {
                type: 'photo',
                media:  `https://image.tmdb.org/t/p/w500${media.poster_path}`,
                caption: createMediaCaption(media, media.media_type),
                parse_mode: 'HTML',
            },
            {
                reply_markup: keyboardSendMediaCardInline(media.id, media.media_type)
            }
        )

        console.log('end')

    } catch (e) {
        console.log('chosenInlineMedia error', e)
    }

}
