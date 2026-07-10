import {keyboardSendMediaCardInline} from "#server/bot/consts/buttons/keyboardBot";
import {createMediaCaption} from "#server/bot/consts/media/createMediaCaption";


export const chosenInlineMedia = async(ctx:any)=>{

    console.log('res', ctx.chosenInlineResult)
    console.log('res await', await ctx.chosenInlineResult)

    console.log('sec', ctx.chosen_inline_result)
}
