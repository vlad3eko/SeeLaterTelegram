import type {ContentType} from "#server/global/engine/search/strategy/enums"
import {URL_ACTIVE} from "#server/bot/bot";
import {internalFetch} from "#server/utils/api/internalFetch";

export type ModeEditSession =
    | 'media'
    | 'text'
    | 'overview'
    | 'publish'
    | 'type'
    | 'download'
    | 'trailer'

/**
 * Откуда взят ключ трейлера. `manual`: администратор сам прислал ссылку
 * («Изменить ключ трейлера»), тогда публикация идёт с проверкой clean и выбором хука
 * (ручная ветка). Иначе ключ из карточки и публикация автоматическая.
 */
export type TrailerKeySource = 'manual'

/** Тип видео по ручной ссылке: trailer (по умолчанию) или clip — нарезка/фрагмент. */
export type SessionVideoType = 'trailer' | 'clip'

export type AdminEditSession = {
    publishStartedAt?: number
    inlineMessageId?: string
    chatId?: number | string
    messageId?: number

    mediaId: number
    mediaType: 'movie' | 'tv'

    media: any

    contentType: ContentType

    keyTrailer?: string
    trailerKeySource?: TrailerKeySource
    videoType?: SessionVideoType
    comment?: string
    overview?: string

    mode?: ModeEditSession

    preparedInstagram?: {
        keyTrailer: string
        reelR2: string | undefined
        telegramFileId?: string | undefined
    }

    currentMedia: {
        type: 'photo' | 'video'
        fileId: string
    }
}

export type AdminEditSessionUpdate = {
    publishStartedAt?: number | null
    inlineMessageId?: string | null
    chatId?: number | string | null
    messageId?: number | null

    mediaId?: number
    mediaType?: 'movie' | 'tv'
    media?: any
    contentType?: ContentType

    keyTrailer?: string | null
    trailerKeySource?: TrailerKeySource | null
    videoType?: SessionVideoType | null
    comment?: string | null
    overview?: string | null

    mode?: ModeEditSession | null

    preparedInstagram?: {
        keyTrailer: string
        reelR2: string | undefined
        telegramFileId?: string | undefined
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
    await internalFetch(
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
    await internalFetch<AdminEditSession | null>(
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
    await internalFetch(
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
    await internalFetch(
        '/api/bot/session/card/updateSessionEditCard',
        {
            method: 'PATCH',
            body: {
                telegram_id: userId,
                data
            }
        }
    )
