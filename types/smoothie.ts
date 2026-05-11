export interface ISmoothie {
    id: number
    created_at: string
    title: string
    method: string
    rating: number
}

export interface ISmoothieCard {
    card: ISmoothie
}

export type SupabaseSortByType = 'created_at' | 'title' | 'rating'
