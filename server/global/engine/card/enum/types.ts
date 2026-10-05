
import {ContentType} from "#server/global/engine/search/strategy/enums"

export type statusRichCard = "pending" | "ready" | "error"
export type RichCardMode = 'item' | 'list'
export type typeRichCard = "person" | "movie" | "tv"
export type typeOverride = 'photo' | 'video'

export interface queryRichCard {
    id: number
    type: typeRichCard
    status: statusRichCard
    contentType: ContentType
    addComment?: string
    addOverview?: string
    keyTrailer?: string
    mediaOverride?: {
        type: typeOverride
        fileId: string
    }
}

export interface queryCTX {
    ctx: any
    inlineMessageId?: string
    chatId?: number | string
    messageId?: number
    isAdmin: boolean
}

export type CardData = {
    media: any,
    contentType: string,
    addComment?: string,
    addOverview?: string,
    keyTrailer?: string,
    mediaOverride?: {
        type: 'photo' | 'video'
        fileId: string
    },
    images?: {
        poster: (string | null)[],
        postersList: ({
            id: number;
            fileId: string;
            name: string;
            role: string;
        } | null)[];
    },
}
