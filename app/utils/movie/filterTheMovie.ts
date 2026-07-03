import type {TmdbMovieDetails} from "~/types/tmdb.types";

export const filterTheMovie = (movie: TmdbMovieDetails) => {
    return (
        movie.media_type === 'movie'
        && movie.overview
        && (movie.backdrop_path || movie.poster_path)
    )
}
