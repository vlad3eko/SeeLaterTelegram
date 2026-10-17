
import { serverSupabaseClient } from '#supabase/server'

export default defineEventHandler(async (event) => {

    const supabase =
        await serverSupabaseClient(event)

    const query = getQuery(event)

    const { count, error } = await supabase
        .from('favorites')
        .select('*', {
            count: 'exact',
            head: true
        })
        .eq('tmdb_id', query.tmdbId)

    if (error) {
        throw createError({
            status: 500,
            message: error.message
        })
    }

    return count ?? 0
})
