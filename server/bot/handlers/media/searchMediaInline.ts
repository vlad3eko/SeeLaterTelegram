import {processSearchMediaInline} from "#server/bot/handlers/media/processSearchMediaInline";
import {searchMedia} from "~/utils/search/searchMedia";


export const searchMediaInline = async (ctx: any) => {

    try {

        const page = Number(ctx.inlineQuery.offset) || 1

        const medias = await searchMedia(ctx.inlineQuery.query, page)
        console.log('medias', medias)

        if (!medias.results?.length) return ctx.answerInlineQuery(['пусто...'])
        await processSearchMediaInline(ctx, medias)

    } catch (error) {
        console.error("inline search error:", error)
        await ctx.answerInlineQuery([])
    }
}
