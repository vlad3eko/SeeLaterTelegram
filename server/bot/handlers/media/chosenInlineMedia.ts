import {createMediaCaption} from "#server/bot/consts/media/createMediaCaption";
import {keyboardSendMediaCardInline} from "#server/bot/consts/buttons/keyboardBot";

export const chosenInlineMedia = async (ctx:any)=>{

    try {

        const result =
            ctx.chosenInlineResult


        console.log(
            'chosen result',
            result
        )


        const inlineMessageId =
            result.inline_message_id


        const resultId =
            result.result_id


        if(!inlineMessageId || !resultId)
            return



        const [
            mediaType,
            mediaId
        ] =
            resultId.split('_')



        const media = await $fetch(
            '/api/bot/media/getMediaBot',
            {
                query:{
                    media: mediaType,
                    id: mediaId
                }
            }
        )



        await new Promise(resolve =>
            setTimeout(resolve,300)
        )



        await ctx.telegram.editMessageMedia(

            undefined,

            undefined,

            inlineMessageId,


            {
                type:'photo',

                media:
                    `https://image.tmdb.org/t/p/w500${media.poster_path}`,

                caption:
                    createMediaCaption(
                        media,
                        mediaType
                    ),

                parse_mode:'HTML'
            },


            {
                reply_markup:
                    keyboardSendMediaCardInline(
                        mediaId,
                        mediaType
                    )
            }
        )



    } catch(e){

        console.log(
            'chosenInlineMedia error',
            e
        )

    }

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
