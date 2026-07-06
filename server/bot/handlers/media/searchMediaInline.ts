import {processSearchMediaInline} from "#server/bot/handlers/media/processSearchMediaInline";
import {loadGenres} from "#server/bot/consts/media/genresConvert";
import {normalizeMedia} from "#server/bot/consts/media/normalizeMedia";
import {deleteMessages} from "#server/bot/actions/delete/deleteMessages";

export const searchMediaInline = async (ctx: any) => {
    try {

        await loadGenres()
        await deleteMessages(ctx, [-1])

        const medias = await $fetch('/api/tmdb/search', {
            query: {
                q: ctx.inlineQuery.query,
            }
        })

        medias.results =
            medias.results.map(normalizeMedia)

        await processSearchMediaInline(ctx, medias)

    } catch (error) {
        console.error(error)

        await ctx.answerInlineQuery([])
    }
}
