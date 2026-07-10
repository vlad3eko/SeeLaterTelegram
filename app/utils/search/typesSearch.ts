export interface SearchFilters {
    genres: string[]
    years: number[]
    providers: string[]
    countries: string[]
    companies: string[]
    mediaTypes: ('movie' | 'tv')[]
    sort?: string
    vote?: number
}

export interface SearchQuery {
    text: string
    page: number
    filters: SearchFilters
}

export interface NormalizedSearchFilters {
    genres: number[]
    years: number[]
    providers: number[]
    countries: string[]
    companies: number[]
    mediaTypes: ('movie' | 'tv')[]
    sort?: string
    vote?: number
}

export interface NormalizedSearchQuery {
    text: string
    page: number
    filters: NormalizedSearchFilters
}
