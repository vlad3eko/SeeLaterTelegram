import {keyboardSendMediaCardInline} from "#server/bot/consts/buttons/keyboardBot";
import {createMediaCaption} from "#server/bot/consts/media/createMediaCaption";


export const chosenInlineMedia = async(ctx:any)=>{

    try {

        const result =
            ctx.chosenInlineResult


        console.log(
            'chosen result:',
            result
        )


        const inlineMessageId =
            result.inline_message_id


        if(!inlineMessageId){
            console.log(
                'Нет inline_message_id'
            )
            return
        }


        const [
            mediaType,
            mediaId
        ] =
            result.result_id.split('_')


        const media =
            await $fetch(
                '/api/bot/media/getMediaBot',
                {
                    query:{
                        media:mediaType,
                        id:mediaId
                    }
                }
            )

        await new Promise(resolve =>
            setTimeout(resolve,800)
        )


        await ctx.telegram.editMessageMedia(
            undefined,
            undefined,
            inlineMessageId,
            {
                type:'photo',

                media:
                    `https://image.tmdb.org/t/p/w500${media.poster_path || media.backdrop_path}`,

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
                        Number(mediaId),
                        mediaType
                    )
            }
        )


    } catch(e){

        console.log(
            'chosenInlineMedia error:',
            e
        )
    }

}
