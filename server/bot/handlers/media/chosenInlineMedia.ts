import {keyboardSendMediaCardInline} from "#server/bot/consts/buttons/keyboardBot";
import {createMediaCaption} from "#server/bot/consts/media/createMediaCaption";
import {genresConvert} from "~/utils/convert/genresConvert";


export const chosenInlineMedia = async (ctx: any) => {

    try {
        const result = ctx.chosenInlineResult
        let inlineMessageId
        if (result) inlineMessageId = result.inline_message_id

        if (!inlineMessageId) return

        const [
            _,
            mediaType,
            contentType,
            mediaId
        ] = result.result_id.split('_')

        const media = await $fetch(
            '/api/bot/getMediaBot',
            {
                query: {
                    media: mediaType,
                    id: mediaId
                }
            }
        )

        await ctx.telegram.editMessageMedia(undefined, undefined, inlineMessageId,
            {
                type: 'photo',
                media: `https://image.tmdb.org/t/p/w500${media.poster_path || media.backdrop_path}`,
                caption: createMediaCaption(media, contentType),
                parse_mode: 'HTML',
            },
            {
                reply_markup: keyboardSendMediaCardInline(mediaId, mediaType, contentType, media.genres)
            }
        )

    } catch (e) {
        console.log('chosenInlineMedia error:', e)
    }
}
