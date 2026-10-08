import type {ContentType} from "#server/global/engine/search/strategy/enums"

export type ModeEditSession =
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

    keyTrailer?: string
    comment?: string
    overview?: string

    mode?: ModeEditSession

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

export type AdminEditSessionUpdate = {
    inlineMessageId?: string | null
    chatId?: number | string | null
    messageId?: number | null

    mediaId?: number
    mediaType?: 'movie' | 'tv'
    media?: any
    contentType?: ContentType

    keyTrailer?: string | null
    comment?: string | null
    overview?: string | null

    mode?: ModeEditSession | null

    preparedInstagram?: {
        keyTrailer: string
        reelR2: string
        telegramFileId?: string
    } | null

    currentMedia?: {
        type: 'photo' | 'video'
        fileId: string
    }
}

export const setAdminEditSession = async (
    userId: number,
    data: AdminEditSession
) =>
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

export const getAdminEditSession = async (
    userId: number
): Promise<AdminEditSession | null> =>
    await $fetch<AdminEditSession | null>(
        '/api/bot/session/card/getSessionEditCard',
        {
            method: 'GET',
            query: {
                telegram_id: userId
            }
        }
    )

export const clearAdminEditSession = async (
    userId: number
) =>
    await $fetch(
        '/api/bot/session/card/clearSessionEditCard',
        {
            method: 'POST',
            body: {
                telegram_id: userId
            }
        }
    )

export const updateAdminEditSession = async (
    userId: number,
    data: AdminEditSessionUpdate
) =>
    await $fetch(
        '/api/bot/session/card/updateSessionEditCard',
        {
            method: 'PATCH',
            body: {
                telegram_id: userId,
                data
            }
        }
    )
