import type {TmdbPersonMovieCrew} from "~/types/tmdb.person.types";

export const filterRoleWriter = (person: TmdbPersonMovieCrew) => {
    return (
        person.job === 'Writer'
        && person.overview
        && (person.backdrop_path || person.poster_path)
    )
}
