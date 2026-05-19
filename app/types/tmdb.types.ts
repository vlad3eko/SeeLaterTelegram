import type {MoviePropsMode} from "~/types/movie.types";

export interface TmdbResponse {
    page: number
    results: TmdbMovie[]
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

export interface TmdbMovieDetails extends TmdbMovie {
    trailers: TmdbTrailer[]

    tagline?: string
    runtime?: number

    genres?: TmdbGenre[]

    origin_country?: string[]
}

export interface TmdbMovie {
    id: number
    poster_path: string
    backdrop_path?: string
    title: string
    overview: string
    release_date: string
    vote_average: number
    vote_count: number
}

export interface TmdbGenre {
    id: number
    name: string
}

export interface TmdbMovieProps {
    movie: TmdbMovie
    mode?: Extract<MoviePropsMode, 'tmdb'>
}

export interface TmdbMoviesProps {
    movies: TmdbMovie[]
    loading?: boolean
    mode?: Extract<MoviePropsMode, 'tmdb'>
}
