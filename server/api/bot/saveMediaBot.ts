import {serverSupabaseClient} from '#supabase/server'
import {createFavorite} from "#server/bot/services/supabase/addFavorite";

export default defineEventHandler(async (event) => {

    const supabase =
        await serverSupabaseClient(event)

    const body = await readBody(event)

    const {data: user} = await supabase
        .from('users')
        .select('id')
        .eq('telegram_id', body.userId)
        .single()

    const {error} = await createFavorite(supabase, {
        userId: user.id,
        tmdbId: body.mediaId,
        title: body.mediaTitle,
        mediaType: body.mediaType,
        posterPath: body.mediaPoster,
        voteAverage: body.voteAverage,
        voteCount: body.voteCount,
        releaseDate: body.releaseDate,
    })

    return {
        success: !error,
        error
    }

})
