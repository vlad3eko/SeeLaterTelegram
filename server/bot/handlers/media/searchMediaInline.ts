import {processSearchMediaInline} from "#server/bot/handlers/media/processSearchMediaInline";
import {searchMedia} from "~/utils/search/searchMedia";


export const searchMediaInline = async (ctx: any) => {

    console.log('1 searchMediaInline ctx.inlineQuery.query', ctx.inlineQuery.query, ctx.from.id)
    try {

        const page = Number(ctx.inlineQuery.offset) || 1

        const medias = await searchMedia(ctx.inlineQuery.query, page, ctx.from.id)

        console.log('10 medias', medias)
        if (!medias.results?.length) return ctx.answerInlineQuery([])
        await processSearchMediaInline(ctx, medias)

    } catch (error) {
        console.error("inline search error:", error)
        await ctx.answerInlineQuery([])
    }
}
