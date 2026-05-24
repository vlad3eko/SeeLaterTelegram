import type {TmdbBaseMovie} from "~/types/tmdb.person.types";

export const filterTheMovie = (movie: TmdbBaseMovie) => {
    return (
        movie.media_type === 'movie'
        && movie.overview
        && (movie.backdrop_path || movie.poster_path)
    )
}
