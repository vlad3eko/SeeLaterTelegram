import type {Movie} from "~/types/movie.types";
import type {TmdbMovieDetails} from "~/types/tmdb.types";

export const mapTmdbMovie = (
    media: TmdbMovieDetails
): Partial<Movie> => {

    return {
        title:
            media.media_type === 'movie'
                ? media.title
                : media.name,

        tmdb_id: media.id,

        media_type: media.media_type
    }
}
