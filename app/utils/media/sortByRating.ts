import type {TmdbMovieDetails} from "~/types/tmdb.types";

export const sortByRating = (a: TmdbMovieDetails, b: TmdbMovieDetails) =>
    b.vote_average - a.vote_average
