
/**
 * Удалить тайтл из коллекции. mediaType обязателен для бота: фильм и сериал с одним TMDB id — разные
 * тайтлы, удаление сериала не должно удалять фильм. Без типа (старые вызовы) — по одному TMDB id.
 */
export const deleteFavorite = async (
    supabase: any,
    userId: number,
    mediaId: number,
    mediaType?: string
) => {
    let query = supabase
        .from('favorites')
        .delete({count: 'exact'})
        .eq('user_id', userId)
        .eq('tmdb_id', mediaId)
    if (mediaType === 'movie' || mediaType === 'tv') query = query.eq('media_type', mediaType)
    return await query
}
