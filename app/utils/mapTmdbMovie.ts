import type {TmdbMovieDetails} from "~/types/tmdb.types";
import type {MediaTypesSupabase} from "~/types/bookmarks/media.types";

export const mapTmdbMovie = (
    media: TmdbMovieDetails
): Partial<MediaTypesSupabase> => {

    return {
        tmdb_id: media.id,
        title:  media.title || media.name,
        media_type: media.media_type,
        poster_path: media.poster_path || media.backdrop_path,
        vote_average: media.vote_average,
        vote_count: media.vote_count,
        release_date: media.release_date || media.first_air_date,
    }
}
