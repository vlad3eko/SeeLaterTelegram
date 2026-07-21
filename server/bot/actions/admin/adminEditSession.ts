import type {ContentType} from "~/utils/search/strategy/enums";
import type {TmdbGenre} from "~/types/tmdb.types";

type AdminEditSession = {
    inlineMessageId: string

    mediaId: number
    mediaType: 'movie' | 'tv'

    media: any

    contentType: ContentType

    comment?: string

    mode: 'media' | 'text' | undefined
}


const sessions = new Map<number, AdminEditSession>()


export const setAdminEditSession = (
    userId:number,
    data:AdminEditSession
) => {
    sessions.set(userId, data)
}


export const getAdminEditSession = (
    userId:number
) => {
    return sessions.get(userId)
}


export const clearAdminEditSession = (
    userId:number
) => {
    sessions.delete(userId)
}
