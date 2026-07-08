import {createMediaCaption} from "#server/bot/consts/media/createMediaCaption";
import {addMessageSession} from "#server/bot/services/session/addMessageSession";
import {SessionMessageType} from "#server/bot/consts/types/SessionMessageTypes";
import {keyboardSendMediaCardInline} from "#server/bot/consts/buttons/keyboardBot";

export const sendMediaCard = async (ctx: any, id: number, mediaType: string) => {
    const media = await $fetch(
        '/api/bot/getMediaBot',
        {
            query: {
                id: id,
                media: mediaType
            }
        }
    )

    const mediaPoster = media.poster_path || media.backdrop_path

    const callbackData =
        `${media.id}_${mediaType}`

    const sendCardMedia =  await ctx.replyWithPhoto(
        `https://image.tmdb.org/t/p/w500${mediaPoster}`,
        {
            caption: createMediaCaption(media, false, mediaType),
            reply_markup: keyboardSendMediaCardInline(ctx, callbackData),
            parse_mode: 'HTML'
        }
    )

    await addMessageSession(ctx.from.id, sendCardMedia.message_id, SessionMessageType.SendMediaCard)
}
