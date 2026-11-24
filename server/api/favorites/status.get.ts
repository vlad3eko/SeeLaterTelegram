
import {serverSupabaseServiceRole} from "#supabase/server";
import {getSessionUser} from "#server/utils/api/sessionUser";

// Сохранён ли тайтл у вошедшего пользователя (для сердечка на странице тайтла).
export default defineEventHandler(async (event) => {

    const query = getQuery(event)

    const tmdbId = Number(query.tmdb_id)
    const mediaType = query.media_type

    if (!Number.isSafeInteger(tmdbId) || tmdbId <= 0 || (mediaType !== 'movie' && mediaType !== 'tv')) {
        throw createError({status: 400, message: 'Invalid request'})
    }

    const user = await getSessionUser(event)

    if (!user) return {auth: false, saved: false}

    const supabase = serverSupabaseServiceRole(event) as any

    const {count} = await supabase
        .from('favorites')
        .select('tmdb_id', {count: 'exact', head: true})
        .eq('user_id', user.id)
        .eq('tmdb_id', tmdbId)
        .eq('media_type', mediaType)

    return {auth: true, saved: (count ?? 0) > 0}
})
