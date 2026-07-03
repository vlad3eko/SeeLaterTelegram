export async function createFavorite(
    supabase: any,
    payload: any
) {
    return await supabase
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
        })
        .select()
}
