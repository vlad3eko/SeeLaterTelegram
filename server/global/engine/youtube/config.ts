/**
 * Настройки автопубликации трейлеров с YouTube (все необязательные, значения по умолчанию в коде).
 *
 *   YOUTUBE_WATCH_CHANNELS          заменить список каналов: «UC…:слово|слово,UC…:слово», например
 *                                   «UC6A-Z0jDKemh9-CwGbj5yog:дубляж,UCWOA1ZGywLbqmigxE4Qlvuw:trailer|teaser»;
 *                                   канал без слов получает trailer|teaser
 *   YOUTUBE_QUEUE_INTERVAL_MINUTES  минут между публикациями, по умолчанию 120
 *   YOUTUBE_QUEUE_MAX_AGE_HOURS     ролики старше не ставятся в очередь, по умолчанию 72
 *   YOUTUBE_QUEUE_FILM_COOLDOWN_DAYS фильм, опубликованный за столько дней, не публикуется снова, по умолчанию 7
 *   YOUTUBE_API_KEY                 ключ YouTube Data API v3: самый надёжный и дешёвый источник списка роликов
 *   YOUTUBE_QUEUE_ENABLED           off — таймер ничего не делает (аварийный выключатель)
 *   YOUTUBE_QUEUE_DEV_TICK          off — не запускать таймер в npm run dev
 *   YOUTUBE_QUEUE_TICK_MINUTES      период таймера в dev, по умолчанию 10
 */

export type WatchedChannel = {
    id: string
    name: string
    /** Слова в названии ролика (любое из них, без учёта регистра). */
    keywords: string[]
}

const TRAILER = ['trailer', 'teaser']

/**
 * Ролики с этими словами не ставятся, даже если в названии есть «trailer»: трейлеры игр и
 * переизданий, подкасты, ролики о съёмках (студии выкладывают их вперемешку с трейлерами).
 */
export const EXCLUDED_TITLE_WORDS = [
    'roblox', 'fortnite', 'minecraft', 'gameplay', 'game trailer', 'video game',
    'podcast', 'featurette', 'behind the scenes', 'deep dive', 'reaction', 'recap',
    'steelbook', 'blu-ray', 'anniversary', 'collector', 're-release', 'rerelease'
]

const DEFAULT_CHANNELS: WatchedChannel[] = [
    // Русские трейлеры: только дубляж.
    {id: 'UC6A-Z0jDKemh9-CwGbj5yog', name: 'KinomanTrailers', keywords: ['дубляж']},

    // Киностудии и стриминги (оригинальные трейлеры; субтитры переводит цепочка Reel).
    {id: 'UCjmJDM5pRKbUlVIzDYYWb6g', name: 'Warner Bros.', keywords: TRAILER},
    {id: 'UCq0OueAsdxH6b8nyAspwViw', name: 'Universal Pictures', keywords: TRAILER},
    {id: 'UCz97F7dMxBNOfGYu3rx8aCw', name: 'Sony Pictures Entertainment', keywords: TRAILER},
    {id: 'UCF9imwPMSGz4Vq1NiTWCC7g', name: 'Paramount Pictures', keywords: TRAILER},
    {id: 'UC2-BeLxzUBSs0uSrmzWhJuQ', name: '20th Century Studios', keywords: TRAILER},
    {id: 'UC_5niPa-d35gg88HaS7RrIw', name: 'Disney', keywords: TRAILER},
    {id: 'UC_IRYSp4auq7hKLvziWVH6w', name: 'Pixar', keywords: TRAILER},
    {id: 'UCvC4D8onUfXzvjTOM-dBfEA', name: 'Marvel Entertainment', keywords: TRAILER},
    {id: 'UCJ6nMHaJPZvsJ-HmUmj1SeA', name: 'Lionsgate Movies', keywords: TRAILER},
    {id: 'UCuPivVjnfNo4mb3Oog_frZg', name: 'A24', keywords: TRAILER},
    {id: 'UCU4SM3j_9TNWaSu8KdGV50g', name: 'Focus Features', keywords: TRAILER},
    {id: 'UCpy5dRhZd-JbZP4NsrnLt1w', name: 'NEON', keywords: TRAILER},
    {id: 'UCWOA1ZGywLbqmigxE4Qlvuw', name: 'Netflix', keywords: TRAILER},
    {id: 'UCQJWtTnAHhEG5w4uN0udnUQ', name: 'Prime Video', keywords: TRAILER},
    {id: 'UC1Myj674wRVXB9I4c6Hm5zA', name: 'Apple TV', keywords: TRAILER},
    {id: 'UCIrgJInjLS2BhlHOMDW7v0g', name: 'Disney Plus', keywords: TRAILER}
]

const readNumber = (name: string, fallback: number, min: number, max: number) => {
    const raw = process.env[name]?.trim()
    const value = raw ? Number(raw) : Number.NaN
    return Number.isFinite(value) && value >= min && value <= max ? value : fallback
}

const isOff = (value: string | undefined) =>
    ['off', '0', 'false', 'no'].includes((value ?? '').trim().toLowerCase())

const parseChannelsEnv = (raw: string | undefined): WatchedChannel[] =>
    (raw ?? '')
        .split(',')
        .map(entry => entry.trim())
        .map(entry => {
            const [id, words] = entry.split(':')
            const keywords = (words ?? '').split('|').map(word => word.trim().toLowerCase()).filter(Boolean)
            return {id: id?.trim() ?? '', name: id?.trim() ?? '', keywords: keywords.length ? keywords : TRAILER}
        })
        .filter(channel => /^UC[0-9A-Za-z_-]{22}$/.test(channel.id))

export const youtubeQueueConfig = () => {
    const fromEnv = parseChannelsEnv(process.env.YOUTUBE_WATCH_CHANNELS)

    return {
        enabled: !isOff(process.env.YOUTUBE_QUEUE_ENABLED),
        devTick: !isOff(process.env.YOUTUBE_QUEUE_DEV_TICK),
        channels: fromEnv.length ? fromEnv : DEFAULT_CHANNELS,
        intervalMinutes: readNumber('YOUTUBE_QUEUE_INTERVAL_MINUTES', 120, 1, 7 * 24 * 60),
        maxAgeHours: readNumber('YOUTUBE_QUEUE_MAX_AGE_HOURS', 72, 1, 30 * 24),
        filmCooldownDays: readNumber('YOUTUBE_QUEUE_FILM_COOLDOWN_DAYS', 7, 0, 365),
        devTickMinutes: readNumber('YOUTUBE_QUEUE_TICK_MINUTES', 10, 1, 24 * 60),
        apiKey: process.env.YOUTUBE_API_KEY?.trim() || undefined
    }
}
