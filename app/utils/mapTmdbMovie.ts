import type {
    TmdbMovieDetails
} from "~/types/tmdb.types"

import type {
    Movie
} from "~/types/movie.types"

export const mapTmdbMovie = (
    media: TmdbMovieDetails
): Partial<Movie> => {

    return {
        title: media.name || media.title,
        tmdb_id: media.id,
        media_type: media.media_type
    }
}
