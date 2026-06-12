export interface Movie {
    id: number
    created_at: string

    title: string
    description: string
    poster_path: string
    rating: number
    release_date?: string

    tmdb_id?: number
    media_type?: string
}

export type MovieSortField =
    'created_at' | 'title' | 'rating'

export type MoviePropsMode = 'default' | 'tmdb'

export interface TmdbBaseMedia {
    adult: boolean
    backdrop_path: string | null
    genre_ids: number[]
    id: number
    media_type: 'movie' | 'tv'
    original_language: string
    overview: string
    popularity: number
    poster_path: string | null
    softcore: boolean
    vote_average: number
    vote_count: number
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
    origin_country: string[]
}

export type TmdbMedia =
    | TmdbMovie
    | TmdbTv




