
import {serverSupabaseServiceRole} from "#supabase/server";
import {createFavorite} from "#server/bot/services/supabase/addFavorite";
import {getSessionUser} from "#server/utils/api/sessionUser";

const text = (value: unknown, max: number): string | null =>
    typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null

const num = (value: unknown): number | null => {
    const parsed = Number(value)
    return value !== null && value !== '' && Number.isFinite(parsed) ? parsed : null
}

// Сайт добавляет в избранное. user_id берётся из сессии, а не из тела запроса.
export default defineEventHandler(async (event) => {

    const user = await getSessionUser(event)

    if (!user) {
        throw createError({
            status: 401,
            message: 'Unauthorized'
        })
    }

    const body = await readBody(event)

    const tmdbId = Number(body?.tmdb_id)
    const mediaType = body?.media_type
    const title = text(body?.title, 500)

    if (
        !Number.isSafeInteger(tmdbId) || tmdbId <= 0 ||
        (mediaType !== 'movie' && mediaType !== 'tv') ||
        !title
    ) {
        throw createError({
            status: 400,
            message: 'Invalid favorite'
        })
    }

    const supabase = serverSupabaseServiceRole(event) as any

    const {data, error} = await createFavorite(supabase, {
        userId: user.id,
        tmdbId,
        title,
        mediaType,
        posterPath: text(body?.poster_path, 300),
        voteAverage: num(body?.vote_average),
        voteCount: num(body?.vote_count),
        releaseDate: text(body?.release_date, 32),
    })

    if (error) {
        // Уже в избранном — не ошибка.
        if (error.code === '23505') {
            return {success: true, duplicate: true}
        }

        console.error('[FAVORITE ADD ERROR]', error)

        throw createError({
            status: 500,
            message: 'Favorite was not saved'
        })
    }

    return {
        success: true,
        data
    }
})
