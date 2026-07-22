import {processSearchMediaInline} from "#server/bot/handlers/media/processSearchMediaInline";
import {searchMedia} from "~/utils/search/searchMedia";
import {parseSearchQuery} from "~/utils/search/parseSearchQuery";
import {keyboardSearchBot} from "#server/bot/consts/buttons/keyboardBot";
import {checkInlineQuery} from "#server/bot/consts/checkInlineQuery";

export const searchMediaInline = async (ctx: any) => {

    const query = ctx.inlineQuery.query.trim()

    const parsed = parseSearchQuery(
        query,
        ctx.from.id
    )

    const hasTags =
        parsed.filters.genres.length > 0 ||
        parsed.filters.mediaTypes.length > 0

    const hasText =
        parsed.text.length === 0 || parsed.text.length >= 3

    if (!hasTags && !hasText) {
        return await ctx.answerInlineQuery([])
    }

    try {
        const page = Number(ctx.inlineQuery.offset) || 1
        const medias = await searchMedia(ctx.inlineQuery.query, page, ctx.from.id)

        if (!medias.results?.length) {
            return await checkInlineQuery(ctx)
        }

        await processSearchMediaInline(ctx, medias)

    } catch (error) {
        console.error("inline search error:", error)
        await ctx.answerInlineQuery([])
    }
}
