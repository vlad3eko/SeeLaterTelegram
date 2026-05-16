export interface Movie {
    id: number
    created_at: string

    title: string
    description: string
    poster_path: string
    rating: number | string | null
    release_date?: string

    status: MovieStatus

    tmdb_id?: number
}

export type MovieStatus =
    | 'planned'
    | 'watching'
    | 'watched'

export type PostersMovie = 'poster_path' | 'backdrop_path'

export type MoviePayload =
    Pick<
        Movie,
        'title' | 'rating'>

export type MovieMode =
    'create' | 'update'

export type MovieEditableData =
    Pick<Movie, 'id' | 'title' | 'rating'>

export interface MovieFormProps {
    mode:
        MovieMode
    card?:
        MovieEditableData
}

export type MovieSortField =
    'created_at' | 'title' | 'rating'

export type MoviePropsMode = 'default' | 'tmdb'


export interface MovieCardProps {
    movie: Movie
    mode?: Extract<MoviePropsMode, 'default'>
}

export interface MovieCardsProps {
    movies: Movie[]
    loading?: boolean
    mode?: Extract<MoviePropsMode, 'default'>
}






