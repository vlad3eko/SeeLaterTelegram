import { serverSupabaseClient } from '#supabase/server'

export default defineEventHandler(async (event) => {

    const supabase =
        await serverSupabaseClient(event)

    const body = await readBody(event)

    const {data: user} = await supabase
        .from('users')
        .select('id')
        .eq('telegram_id', body.userId)
        .single()

    const { error } = await supabase
        .from('favorites')
        .insert({
            user_id: user.id,
            title: body.mediaTitle,
            tmdb_id: body.mediaId,
            media_type: body.mediaType,
            poster_path: body.mediaPoster,
            vote_average: body.voteAverage,
            vote_count: body.voteCount,
            release_date: body.releaseDate,
        })

    return {
        success: !error,
        error
    }

})
