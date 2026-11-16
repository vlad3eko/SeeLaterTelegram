/**
 * Настройки автопубликации трейлеров с YouTube (все необязательные, значения по умолчанию в коде).
 *
 *   YOUTUBE_WATCH_CHANNELS          id каналов через запятую (UC…); по умолчанию @KinomanTrailers
 *   YOUTUBE_WATCH_KEYWORD           слово в названии ролика, по умолчанию «дубляж» (без учёта регистра)
 *   YOUTUBE_QUEUE_INTERVAL_MINUTES  минут между публикациями, по умолчанию 120
 *   YOUTUBE_QUEUE_MAX_AGE_HOURS     ролики старше не ставятся в очередь, по умолчанию 72
 *   YOUTUBE_API_KEY                 ключ YouTube Data API v3: самый надёжный источник списка роликов
 *   YOUTUBE_QUEUE_ENABLED           off — таймер ничего не делает (аварийный выключатель)
 *   YOUTUBE_QUEUE_DEV_TICK          off — не запускать таймер в npm run dev
 *   YOUTUBE_QUEUE_TICK_MINUTES      период таймера в dev, по умолчанию 10
 */

/** @KinomanTrailers — русские трейлеры (дубляж и субтитры). */
const DEFAULT_CHANNELS = ['UC6A-Z0jDKemh9-CwGbj5yog']

const readNumber = (name: string, fallback: number, min: number, max: number) => {
    const raw = process.env[name]?.trim()
    const value = raw ? Number(raw) : Number.NaN
    return Number.isFinite(value) && value >= min && value <= max ? value : fallback
}

const isOff = (value: string | undefined) =>
    ['off', '0', 'false', 'no'].includes((value ?? '').trim().toLowerCase())

export const youtubeQueueConfig = () => {
    const channels = (process.env.YOUTUBE_WATCH_CHANNELS ?? '')
        .split(',')
        .map(value => value.trim())
        .filter(value => /^UC[0-9A-Za-z_-]{22}$/.test(value))

    return {
        enabled: !isOff(process.env.YOUTUBE_QUEUE_ENABLED),
        devTick: !isOff(process.env.YOUTUBE_QUEUE_DEV_TICK),
        channels: channels.length ? channels : DEFAULT_CHANNELS,
        keyword: (process.env.YOUTUBE_WATCH_KEYWORD?.trim() || 'дубляж').toLowerCase(),
        intervalMinutes: readNumber('YOUTUBE_QUEUE_INTERVAL_MINUTES', 120, 1, 7 * 24 * 60),
        maxAgeHours: readNumber('YOUTUBE_QUEUE_MAX_AGE_HOURS', 72, 1, 30 * 24),
        devTickMinutes: readNumber('YOUTUBE_QUEUE_TICK_MINUTES', 10, 1, 24 * 60),
        apiKey: process.env.YOUTUBE_API_KEY?.trim() || undefined
    }
}
