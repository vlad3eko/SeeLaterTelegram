export interface TmdbCredits extends TmdbPerson{
    cast_id: number
    character: string
    order: number
}

export interface TmdbPerson {
    adult: false
    gender: number
    id: number
    known_for_department: string
    name: string
    original_name: string
    popularity: number
    profile_path: string
    file_path: string
    credit_id: string
    birthday: string
    place_of_birth: string
    biography: string
    deathday?: string
    imdb_id: number
    homepage: string
    images: {
        profiles: []
    }
    combined_credits: {
        cast: [],
        crew: []
    }
}

export interface TmdbBaseMovie {
    adult: boolean
    backdrop_path: string | null
    credit_id: string
    genre_ids: number[]
    id: number
    media_type: string
    original_language: string
    original_title: string
    overview: string
    popularity: number
    poster_path: string | null
    release_date: string
    softcore: boolean
    title: string
    video: boolean
    vote_average: number
    vote_count: number
}

export interface TmdbPersonMovieCast extends TmdbBaseMovie {
    character: string
    order: number
}

export interface TmdbPersonMovieCrew extends TmdbBaseMovie {
    department: string
    job: string
}
