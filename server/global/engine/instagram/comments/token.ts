import {createHash, randomBytes} from 'node:crypto'
import {telegramBotShortLink} from '#server/global/oneLinkApp'

/**
 * Токен ссылки из Direct: `t.me/<бот>?start=ig_<токен>`. 16 случайных байт в base64url (22 символа),
 * payload — 25 символов при лимите Telegram 64 (A-Z a-z 0-9 _ -). В базе только sha256 токена:
 * утечка таблицы не даёт рабочих ссылок. В payload нет ни TMDB id, ни Instagram id, ни Telegram id.
 */
export const IG_PAYLOAD_PREFIX = 'ig_'
export const IG_TOKEN_TTL_MS = 30 * 24 * 3600_000

const PAYLOAD = /^ig_([A-Za-z0-9_-]{22})$/

export const createLeadToken = (): string => randomBytes(16).toString('base64url')

export const hashLeadToken = (token: string): string => createHash('sha256').update(token).digest('hex')

export const igStartLink = (token: string): string => `${telegramBotShortLink}?start=${IG_PAYLOAD_PREFIX}${token}`

/** Токен из payload /start или null, если это не ссылка из Instagram. */
export const parseIgPayload = (payload: unknown): string | null => {
    const match = typeof payload === 'string' ? payload.match(PAYLOAD) : null
    return match ? match[1]! : null
}

export const isIgPayload = (payload: unknown): boolean =>
    typeof payload === 'string' && payload.startsWith(IG_PAYLOAD_PREFIX)
