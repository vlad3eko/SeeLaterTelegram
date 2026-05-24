import type {TmdbBaseMovie} from "~/types/tmdb.person.types";

export const sortByRating = (a: TmdbBaseMovie, b: TmdbBaseMovie) =>
    b.vote_average - a.vote_average
