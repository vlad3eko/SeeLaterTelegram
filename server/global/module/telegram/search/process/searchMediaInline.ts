import {searchMediaEntry} from "#server/global/engine/search/searchMediaEntry";
import {parseSearchQuery} from "#server/global/engine/search/mapper/parseSearchQuery";
import {checkInlineQuery} from "#server/bot/consts/checkInlineQuery";
import {executeProcessSearch} from "#server/global/module/executeProcessSearch";

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
        const medias = await searchMediaEntry(ctx.inlineQuery.query, page, ctx.from.id)

        if (!medias.results?.length) return await checkInlineQuery(ctx)
        console.log('medias', medias.total_pages)

        await executeProcessSearch(medias, 'telegram', ctx)

    } catch (error) {
        console.error("process search error:", error)
        await ctx.answerInlineQuery([])
    }
}
