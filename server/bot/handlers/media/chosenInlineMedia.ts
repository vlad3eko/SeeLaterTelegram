import {keyboardSendMediaCardInline} from "#server/bot/consts/buttons/keyboardBot";
import {createMediaCaption} from "#server/bot/consts/media/createMediaCaption";
import {genresConvert} from "~/utils/convert/genresConvert";


export const chosenInlineMedia = async (ctx: any) => {

    try {
        const result = ctx.chosenInlineResult
        console.log('result', result)

        const inlineMessageId = result.inline_message_id

        if (!inlineMessageId) return

        const [_, mediaType, mediaId] = result.result_id.split('_')

        const media = await $fetch(
            '/api/bot/getMediaBot',
            {
                query: {
                    media: mediaType,
                    id: mediaId
                }
            }
        )
        const genresContent = genresConvert(media.genres)

        await new Promise(resolve =>
            setTimeout(resolve, 300)
        )

        await ctx.telegram.editMessageMedia(undefined, undefined, inlineMessageId,
            {
                type: 'photo',
                media: `https://image.tmdb.org/t/p/w500${media.poster_path || media.backdrop_path}`,
                caption: createMediaCaption(media, mediaType),
                parse_mode: 'HTML',
            },
            {
                reply_markup: keyboardSendMediaCardInline(mediaId, mediaType, genresContent)
            }
        )

    } catch (e) {
        console.log('chosenInlineMedia error:', e)
    }
}
