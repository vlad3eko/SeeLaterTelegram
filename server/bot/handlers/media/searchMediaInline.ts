import {processSearchMediaInline} from "#server/bot/handlers/media/processSearchMediaInline";

export const searchMediaInline = async (ctx: any) => {

    const medias = await $fetch(
        '/api/tmdb/search',
        {
            query: {
                q: ctx.inlineQuery.query,
            }
        }
    )

    await processSearchMediaInline(ctx, medias)
}
