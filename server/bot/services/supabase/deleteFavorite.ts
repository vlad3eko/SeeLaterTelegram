export const deleteFavorite = async (
    supabase: any,
    userId: number,
    mediaId: number
) => {
    return await supabase
        .from('favorites')
        .delete({count: 'exact'})
        .eq('user_id', userId)
        .eq('tmdb_id', mediaId)
}
