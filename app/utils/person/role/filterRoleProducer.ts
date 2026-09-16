import type {TmdbPersonMovieCrew} from "~/types/tmdb.person.types";

export const filterRoleProducer = (person: TmdbPersonMovieCrew) => {
    return (
        person.job === 'Producer'
        && person.overview
        && (person.backdrop_path || person.poster_path)
    )
}
