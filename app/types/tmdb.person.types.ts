import type {TmdbBaseMedia} from "~/types/movie.types";

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

export interface TmdbPersonMovieCast extends TmdbBaseMedia {
    character: string
    order: number
}

export interface TmdbPersonMovieCrew extends TmdbBaseMedia {
    department: string
    job: string
}
