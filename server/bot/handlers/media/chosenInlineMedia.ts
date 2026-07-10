import {createMediaCaption} from "#server/bot/consts/media/createMediaCaption";
import {keyboardSendMediaCardInline} from "#server/bot/consts/buttons/keyboardBot";

export const chosenInlineMedia = async (ctx:any)=>{

    const result = ctx.chosenInlineResult
    console.log('chosen results', result)

    if (!result.inline_message_id) return

}

/*
* await ctx.telegram.editMessageMedia(
            undefined,
            undefined,
            inlineMessageId,
            {
                type: 'photo',
                media: `https://image.tmdb.org/t/p/w500${media.poster_path}`,
                caption: createMediaCaption(media, media.media_type),
                parse_mode: 'HTML',
            },
            {
                reply_markup: keyboardSendMediaCardInline(media.id, media.media_type)
            }
        )*/
