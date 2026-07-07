import {addMediaState} from "#server/bot/consts/media/addMediaState";
import {processSearchMedia} from "#server/bot/services/addMedia/processSearchMedia";

export const nameMediaSearch = async (ctx: any) => {

    const query = ctx.message.text
    addMediaState.delete(ctx.from.id)

    const medias = await $fetch(
        '/api/tmdb/search',
        {
            query: {
                q: query,
            }
        }
    )

    await processSearchMedia(ctx, medias)
    await ctx.deleteMessage(ctx.message.message_id - 1)
}
