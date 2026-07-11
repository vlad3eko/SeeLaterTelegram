export const normalizeTmdbMedia = (media:any)=>{

    return {

        ...media,

        tmdb_id:
            media.tmdb_id ||
            media.id,

        media_type:
            media.media_type ||
            (
                media.title
                    ? 'movie'
                    : 'tv'
            ),

        title:
            media.title ||
            media.name,

        release_date:
            media.release_date ||
            media.first_air_date,

        poster_path:
            media.poster_path ||
            media.backdrop_path ||
            null
    }

}
