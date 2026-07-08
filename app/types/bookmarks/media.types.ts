export interface MediaTypesSupabase {
    user_id: number
    tmdb_id: number
    media_type: string
    vote_average: number
    vote_count: number

    title: string
    name?: string | undefined

    poster_path: string
    backdrop_path?: string | undefined

    release_date: number | string
    first_air_date?: string | undefined
}
