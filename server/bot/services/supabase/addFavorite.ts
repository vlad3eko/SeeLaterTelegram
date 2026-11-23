export async function createFavorite(
    supabase: any,
    payload: any
) {
    const result = await supabase
        .from('favorites')
        .insert({
                user_id: payload.userId,
                tmdb_id: payload.tmdbId,
                title: payload.title,
                media_type: payload.mediaType,
                poster_path: payload.posterPath,
                vote_average: payload.voteAverage,
                vote_count: payload.voteCount,
                release_date: payload.releaseDate,
                genres_ids: payload.genresIds,
            },
            {
                onConflict: 'user_id,tmdb_id,media_type',
                ignoreDuplicates: true
            })
        .select()

    if (!result.error) await watchMedia(supabase, payload)
    return result
}

/**
 * «Сохранить» = подписка (задача Notification): тайтл встаёт под слежение — одна строка на тайтл,
 * сколько бы людей его ни сохранили; уже отслеживаемый не трогаем. Первая проверка (таймер
 * notifications/tick) запишет снимок без уведомлений. Ошибка здесь сохранение не ломает:
 * пропущенный тайтл таймер всё равно подберёт из favorites.
 */
const watchMedia = async (supabase: any, payload: any) => {
    if (payload.mediaType !== 'movie' && payload.mediaType !== 'tv') return
    try {
        const {error} = await supabase
            .from('media_watch')
            .upsert({
                media_type: payload.mediaType,
                tmdb_id: Number(payload.tmdbId),
                title: payload.title ?? null,
                poster_path: payload.posterPath ?? null
            }, {onConflict: 'media_type,tmdb_id', ignoreDuplicates: true})
        if (error) console.warn('[NOTIFY] watch on save skipped', error.message)
    } catch (error: any) {
        console.warn('[NOTIFY] watch on save skipped', error?.message ?? error)
    }
}
