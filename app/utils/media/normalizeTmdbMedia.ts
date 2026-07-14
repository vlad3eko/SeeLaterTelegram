import {FormatRating} from "~/utils/formatMoviesData";

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
        media_type: mediaType,
        vote_average: FormatRating(media.vote_average),
        vote_count: `${media.vote_count ? '🍿' + media.vote_count : ''}`,
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
