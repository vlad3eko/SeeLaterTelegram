import type {ContentType} from "#server/global/engine/search/strategy/enums"

type modeEditSession =
    | 'media'
    | 'text'
    | 'overview'
    | 'publish'
    | 'type'
    | 'download'

export type AdminEditSession = {
    inlineMessageId?: string
    chatId?: number | string
    messageId?: number
    mediaId: number
    mediaType: 'movie' | 'tv'
    media: any
    contentType: ContentType
    keyTrailer: string | undefined
    comment?: string | undefined
    overview?: string | undefined
    mode?: modeEditSession
    preparedInstagram?: {
        keyTrailer: string
        reelR2: string
        telegramFileId?: string
    }
    currentMedia: {
        type: 'photo' | 'video'
        fileId: string
    }
}

const sessions = new Map<number, AdminEditSession>()

export const setAdminEditSession = (userId: number, data: AdminEditSession) => {
    sessions.set(userId, data)
}

export const getAdminEditSession = (userId: number) => {
    return sessions.get(userId)
}

export const clearAdminEditSession = (userId: number) => {
    sessions.delete(userId)
}
