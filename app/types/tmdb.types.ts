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
    iso_639_1: string
    iso_3166_1: string
    key: string
    name: string
    official: boolean
    published_at: string
    site: string
    size: number
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
    media: TmdbMovieDetails
    mode?: Extract<MoviePropsMode, 'search'>
    showInfo?: boolean
}

export interface TmdbMoviesProps {
    media: TmdbMovieDetails[]
    loading?: boolean
    mode?: Extract<MoviePropsMode, 'search'>
    showInfo?: boolean
}
