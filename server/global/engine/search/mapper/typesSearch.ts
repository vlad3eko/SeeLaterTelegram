import type {ContentType} from "#server/global/engine/search/strategy/enums";

export interface SearchFilters {
    id: number[]
    personJob: string[]
    genres: string[]
    years: number[]
    providers: string[]
    countries: string[]
    companies: string[]
    mediaTypes: ("movie" | "tv" | "person")[]
    creditType: "cast" | "crew" | undefined
    contentType?: ContentType
    sort?: string
    vote?: number
    isCollection: boolean
}

export interface SearchQuery {
    from: number | null
    text: string
    filters: SearchFilters
}

export interface NormalizedSearchFilters {
    id: number[]
    personJob: string[]
    genres: number[]
    years: number[]
    providers: number[]
    countries: string[]
    companies: number[]
    mediaTypes: ("movie" | "tv" | "person")[]
    creditType: ("cast" | "crew" | undefined)
    contentType?: ContentType
    sort?: string
    vote?: number
    isCollection: boolean
}

export interface NormalizedSearchQuery {
    from: number | null
    text: string
    page: number
    filters: NormalizedSearchFilters
}
