import {addMediaState} from "#server/bot/consts/addMedia/addMediaState";
import {searchMedia} from "#server/bot/actions/addMedia/searchMedia";

export const addMovie = async (ctx: any) => {

    const state = addMediaState.get(
        ctx.from.id
    )

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

    await searchMedia(ctx, medias)
}
