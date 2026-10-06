import type {ContentType} from "#server/global/engine/search/strategy/enums"
import {tmdbFetch} from "#server/utils/api/tmdbFetch";

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

export const setAdminEditSession = async (userId: number, data: AdminEditSession) => {
    // sessions.set(userId, data)

    await $fetch(
        '/api/bot/session/card/setSessionEditCard',
        {
            method: 'POST',
            body: {
                telegram_id: userId,
                data
            }
        }
    )
}

export const getAdminEditSession = async (userId: number):Promise<AdminEditSession | null> => {
    // return sessions.get(userId)

    return await $fetch<AdminEditSession | null>(
        '/api/bot/session/card/getSessionEditCard',
        {
            method: 'GET',
            query: {
                telegram_id: userId,
            }
        }
    )
}

export const clearAdminEditSession = async (userId: number) => {
    // sessions.delete(userId)

    await $fetch(
        '/api/bot/session/card/clearSessionEditCard',
        {
            method: 'POST',
            body: {
                telegram_id: userId,
            }
        }
    )
}
