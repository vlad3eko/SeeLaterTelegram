import type {ContentType} from "#server/global/engine/search/strategy/enums";

type modeEditSession = 'media' | 'text' | 'overview' | 'publish' | 'type'

export type AdminEditSession = {
    inlineMessageId: string

    mediaId: number
    mediaType: 'movie' | 'tv'

    media: any

    contentType: ContentType
    keyTrailer: string | undefined
    comment?: string | undefined
    overview?: string | undefined

    mode?: modeEditSession

    currentMedia: {
        type: 'photo' | 'video'
        fileId: string
    }
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
