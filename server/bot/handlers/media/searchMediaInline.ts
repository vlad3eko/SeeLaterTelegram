import {processSearchMediaInline} from "#server/bot/handlers/media/processSearchMediaInline";
import {searchMedia} from "~/utils/search/searchMedia";


export const searchMediaInline = async (
    ctx:any
)=>{

    try {
        const medias = await searchMedia(ctx.inlineQuery.query)
        await processSearchMediaInline(ctx, medias)

    } catch(error) {
        console.error("inline search error:", error)
        await ctx.answerInlineQuery([])
    }

}
