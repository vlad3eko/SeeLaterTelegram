import type {MoviePropsMode} from "~/types/movie.types";
import type {TmdbBaseMovie, TmdbCredits, TmdbPersonMovieCrew} from "~/types/tmdb.person.types";

export interface TmdbResponse {
    page: number
    results: TmdbBaseMovie[]
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

export interface TmdbMovieDetails extends TmdbBaseMovie {
    trailers: TmdbTrailer[]

    tagline?: string
    runtime?: number

    genres?: TmdbGenre[]

    origin_country?: string[]

    cast?: TmdbCredits[]
    crew?: TmdbPersonMovieCrew[]
}

export interface TmdbGenre {
    id: number
    name: string
}

export interface TmdbMovieProps {
    media: TmdbBaseMovie
    mode?: Extract<MoviePropsMode, 'tmdb'>
}

export interface TmdbMoviesProps {
    media: TmdbBaseMovie[]
    loading?: boolean
    mode?: Extract<MoviePropsMode, 'tmdb'>
}
