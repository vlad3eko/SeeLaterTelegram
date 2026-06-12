import type {MoviePropsMode, TmdbBaseMedia, TmdbMedia, TmdbMovie, TmdbTv} from "~/types/movie.types";
import type {TmdbCredits, TmdbPersonMovieCrew} from "~/types/tmdb.person.types";

export interface TmdbResponse {
    page: number
    results: TmdbMedia[]
    trailer: TmdbTrailer[]
    total_pages: number
    total_results: number
}

export interface TmdbTrailer {
    id: string
    key: string
    name: string
    site: string
    type: string
}

export type TmdbMovieDetails =
    | (TmdbMovie & {
    trailers: TmdbTrailer[]
    tagline?: string
    runtime?: number
    genres?: TmdbGenre[]
    cast?: TmdbCredits[]
    crew?: TmdbPersonMovieCrew[]
})
    | (TmdbTv & {
    trailers: TmdbTrailer[]
    tagline?: string
    runtime?: number
    genres?: TmdbGenre[]
    cast?: TmdbCredits[]
    crew?: TmdbPersonMovieCrew[]
})

export interface TmdbGenre {
    id: number
    name: string
}

export interface TmdbMovieProps {
    media: TmdbBaseMedia
    mode?: Extract<MoviePropsMode, 'tmdb'>
}

export interface TmdbMoviesProps {
    media: TmdbBaseMedia[]
    loading?: boolean
    mode?: Extract<MoviePropsMode, 'tmdb'>
}
