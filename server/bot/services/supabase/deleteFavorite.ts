export const deleteFavorite = async (
    supabase: any,
    userId: number,
    mediaId: number
) => {
    return await supabase
        .from('favorites')
        .delete()
        .eq('user_id', userId)
        .eq('tmdb_id', mediaId)
}
