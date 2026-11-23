import {telegramBotShortLink} from '#server/global/oneLinkApp'

/** Действие бота — payload ссылки /start (чистые функции; хранение и повтор — pendingActions.ts). */
export const ACTION_PAYLOAD = /^(search|collection|inline_settings)$|^(media_cast|similar)_[A-Za-z0-9_]+$|^(save|unsave)_(movie|tv)_\d+$/
export const PENDING_TTL_MS = 24 * 3600_000
export const MAX_PENDING = 10

export const isActionPayload = (payload: unknown): payload is string =>
    typeof payload === 'string' && payload.length <= 64 && ACTION_PAYLOAD.test(payload)

export const mediaActionPayload = (action: 'save' | 'unsave', mediaType: string, mediaId: number) =>
    `${action}_${mediaType}_${mediaId}`

export const parseMediaAction = (payload: string) => {
    const match = /^(save|unsave)_(movie|tv)_(\d+)$/.exec(payload)
    return match ? {action: match[1] as 'save' | 'unsave', mediaType: match[2] as 'movie' | 'tv', mediaId: Number(match[3])} : null
}

export const botStartLink = (ctx: any, payload: string) =>
    `${ctx?.botInfo?.username ? `https://t.me/${ctx.botInfo.username}` : telegramBotShortLink}?start=${payload}`
