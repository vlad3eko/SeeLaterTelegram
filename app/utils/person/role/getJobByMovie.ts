import type {TmdbPersonMovieCrew} from "~/types/tmdb.person.types";

export const getJobByMovie = (data: TmdbPersonMovieCrew[] = [], job: string) => {
    return data.filter(movie => movie.job === job)

}
