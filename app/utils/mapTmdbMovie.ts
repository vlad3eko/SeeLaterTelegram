import type {
    TmdbMovieDetails
} from "~/types/tmdb.types"

import type {
    Movie
} from "~/types/movie.types"

export const mapTmdbMovie = (
    movie: TmdbMovieDetails
): Partial<Movie> => {

    return {
        id: movie.id,
        title: movie.title,
        description: movie.overview,
        poster_path: movie.poster_path || movie.backdrop_path,
        rating: movie.vote_average,
        release_date: movie.release_date,
        status: 'planned',
        tmdb_id: movie.id
    }
}
