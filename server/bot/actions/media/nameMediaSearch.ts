import {addMediaState} from "#server/bot/consts/media/addMediaState";
import {processSearchMedia} from "#server/bot/services/addMedia/processSearchMedia";

export const nameMediaSearch = async (ctx: any) => {

    const state = addMediaState.get(ctx.from.id)
    if (!state?.waitingMovie) return

    addMediaState.delete(ctx.from.id)

    const query = ctx.message.text

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
