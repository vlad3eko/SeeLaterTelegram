import type {TmdbPersonMovieCrew} from "~/types/tmdb.person.types";

export const filterExecutiveProducer = (person: TmdbPersonMovieCrew) => {
    return (
        person.job === "Executive Producer"
        && person.overview
        && (person.backdrop_path || person.poster_path)
    )
}
