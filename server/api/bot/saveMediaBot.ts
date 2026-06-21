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
        })

    return {
        success: !error,
        error
    }

})
