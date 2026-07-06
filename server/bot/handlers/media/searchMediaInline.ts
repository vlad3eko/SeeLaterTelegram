import {processSearchMediaInline} from "#server/bot/handlers/media/processSearchMediaInline";

export const searchMediaInline = async (ctx: any) => {
    try {

        const medias = await $fetch('/api/tmdb/search', {
            query: {
                q: ctx.inlineQuery.query,
            }
        });

        await processSearchMediaInline(ctx, medias);

    } catch (error) {
        console.error(error);

        await ctx.answerInlineQuery([]);
    }
};
