
import {serverSupabaseServiceRole} from "#supabase/server";
import {deleteFavorite} from "#server/bot/services/supabase/deleteFavorite";
import {getSessionUser} from "#server/utils/api/sessionUser";

// Сайт убирает тайтл из избранного. user_id — только из сессии, тип обязателен
// (фильм и сериал с одним TMDB id — разные тайтлы).
export default defineEventHandler(async (event) => {

    const user = await getSessionUser(event)

    if (!user) {
        throw createError({status: 401, message: 'Unauthorized'})
    }

    const body = await readBody(event)

    const tmdbId = Number(body?.tmdb_id)
    const mediaType = body?.media_type

    if (!Number.isSafeInteger(tmdbId) || tmdbId <= 0 || (mediaType !== 'movie' && mediaType !== 'tv')) {
        throw createError({status: 400, message: 'Invalid favorite'})
    }

    const supabase = serverSupabaseServiceRole(event) as any

    const {error, count} = await deleteFavorite(supabase, user.id, tmdbId, mediaType)

    if (error) {
        console.error('[FAVORITE REMOVE ERROR]', error)
        throw createError({status: 500, message: 'Favorite was not removed'})
    }

    return {success: true, removed: count ?? 0}
})
