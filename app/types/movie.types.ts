export interface Movie {
    id: number
    created_at: string

    title: string
    description: string
    poster_path: string | null
    rating: number
    vote_average?: number | null
    vote_count?: number | null
    release_date?: string | null

    tmdb_id?: number
    media_type?: string
}

export type MovieSortField =
    'user_id'
    | 'created_at'
    | 'media_type'
    | 'vote_count'
    | 'release_date'

export type MediaStatus =
    'planned' | 'watching' | 'watched'

export type MoviePropsMode = 'default' | 'tmdb'

export interface TmdbBaseMedia {
    adult: boolean
    backdrop_path: string | null
    poster_path: string | null
    genre_ids: number[]
    id: number
    tmdb_id: number
    original_language: string
    overview: string
    popularity: number
    softcore: boolean
    vote_average: number
    vote_count: number
    production_countries: {
        iso_3166_1: string
        name: string
    }[]
    origin_country: string[]
    status: MediaStatus
}

export interface TmdbMovie extends TmdbBaseMedia {
    media_type: 'movie'
    title: string
    original_title: string
    release_date: string
    video: boolean
}

export interface TmdbTv extends TmdbBaseMedia {
    media_type: 'tv'
    name: string
    original_name: string
    first_air_date: string
    last_air_date: string
    number_of_episodes: number
    number_of_seasons: number
}

export type TmdbMedia =
    | TmdbMovie
    | TmdbTv




