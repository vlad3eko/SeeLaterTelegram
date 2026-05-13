export interface Movie {
    id: number
    created_at: string

    title: string
    description: string
    poster_url: string
    rating: number | null
    release_date?: string

    status: MovieStatus

    tmdb_id?: number
}

export type MovieStatus =
    | 'planned'
    | 'watching'
    | 'watched'


export type MoviePayload =
    Pick<
        Movie,
        'title' | 'method' | 'rating'>

export type MovieMode =
    'create' | 'update'

export type MovieEditableData =
    Pick<Movie, 'id' | 'title' | 'method' | 'rating'>

export interface MovieFormProps {
    mode:
        MovieMode
    card?:
        MovieEditableData
}

export type MovieSortField =
    'created_at' | 'title' | 'rating'

export interface MovieCardProps {
    movie: Movie
}

export interface MovieCardsProps {
    movies: Movie[]
}






