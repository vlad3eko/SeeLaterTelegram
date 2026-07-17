import {ContentType} from "~/utils/search/strategy/enums";

export interface SearchFilters {
    genres: string[]
    years: number[]
    providers: string[]
    countries: string[]
    companies: string[]
    mediaTypes: ('movie' | 'tv')[]
    contentType?: ContentType
    sort?: string
    vote?: number
}

export interface SearchQuery {
    from: number | null
    text: string
    filters: SearchFilters
}

export interface NormalizedSearchFilters {
    genres: number[]
    years: number[]
    providers: number[]
    countries: string[]
    companies: number[]
    mediaTypes: ('movie' | 'tv')[]
    contentType?: ContentType
    sort?: string
    vote?: number
}

export interface NormalizedSearchQuery {
    from: number | null
    text: string
    page: number
    filters: NormalizedSearchFilters
}
