import type {TmdbPersonMovieCrew} from "~/types/tmdb.person.types";

export
const filterRoleDirector = (person: TmdbPersonMovieCrew) => {
    return (
        person.job === "Director"
        && person.overview
        && (person.backdrop_path || person.poster_path)
    )
}
