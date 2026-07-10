import type {TmdbPersonMovieCrew} from "~/types/tmdb.person.types";

export const getMovieByJob = (data: TmdbPersonMovieCrew[], job: string) => {

        return data.filter(movie => movie.job === job && movie.overview
            && (movie.backdrop_path || movie.poster_path))

}
