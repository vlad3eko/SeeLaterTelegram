export interface TmdbCredits extends TmdbPerson{
    cast_id: number
    character: string
    order: number
}


export interface TmdbCrew extends TmdbPerson{
    department: string
    job: string
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
    credit_id: string
}
