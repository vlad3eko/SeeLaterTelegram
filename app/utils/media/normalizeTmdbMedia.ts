export const normalizeTmdbMedia = (media: any) => {

    const mediaType =
        media.media_type ||
        (
            media.title
                ? 'movie'
                : media.name
                    ? 'tv'
                    : undefined
        )

    return {
        ...media,
        id: (media.tmdb_id || media.id),
        // id: media.id,
        media_type: mediaType,
        title:
            media.title ||
            media.name,
        release_date:
            media.release_date ||
            media.first_air_date ||
            null,
        poster_path:
            media.poster_path ||
            media.backdrop_path ||
            null
    }
}
