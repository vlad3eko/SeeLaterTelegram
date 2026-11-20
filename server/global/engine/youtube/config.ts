/**
 * Настройки автопубликации трейлеров с YouTube (все необязательные, значения по умолчанию в коде).
 *
 *   YOUTUBE_WATCH_CHANNELS          заменить список каналов: «UC…:слово|слово,UC…:слово», например
 *                                   «*UC6A-Z0jDKemh9-CwGbj5yog:дубляж,UCWOA1ZGywLbqmigxE4Qlvuw:trailer|teaser»;
 *                                   канал без слов получает trailer|teaser; «*» — приоритетный канал
 *   YOUTUBE_QUEUE_SLOTS             время публикаций по Москве через запятую, по умолчанию
 *                                   «08:00,12:00,18:00,22:00» (schedule.ts)
 *   YOUTUBE_QUEUE_MAX_AGE_HOURS     ролики старше не ставятся в очередь, по умолчанию 72
 *   YOUTUBE_QUEUE_FILM_COOLDOWN_DAYS фильм, опубликованный за столько дней, не публикуется снова, по умолчанию 7
 *   YOUTUBE_API_KEY                 ключ YouTube Data API v3: самый надёжный и дешёвый источник списка роликов
 *   YOUTUBE_QUEUE_ENABLED           off — таймер ничего не делает (аварийный выключатель)
 *   YOUTUBE_QUEUE_DEV_TICK          off — не запускать таймер в npm run dev
 *   YOUTUBE_QUEUE_TICK_MINUTES      период таймера в dev, по умолчанию 10
 *   YOUTUBE_OVERVIEW_SEARCH         on — русский сюжет Gemini сначала ищет в Google (нужен платный
 *                                   тариф Gemini: на бесплатном поиск отвечает 429); иначе только перевод
 */

import {parseSlots} from '#server/global/engine/youtube/schedule'

export type WatchedChannel = {
    id: string
    name: string
    /** Слова в названии ролика (любое из них, без учёта регистра). */
    keywords: string[]
    /**
     * Ролики канала публикуются раньше остальных (решение владельца 20.11: сначала русские
     * трейлеры). Внутри приоритета и вне его порядок прежний — от старых к новым.
     */
    priority?: boolean
}

const TRAILER = ['trailer', 'teaser']

/**
 * Ролики с этими словами не ставятся, даже если в названии есть «trailer»: трейлеры игр и
 * переизданий, подкасты, ролики о съёмках, анонсы анонсов и промо-ролики с хэштегами
 * (студии выкладывают их вперемешку с трейлерами).
 */
export const EXCLUDED_TITLE_WORDS = [
    // Игры
    'roblox', 'fortnite', 'minecraft', 'gameplay', 'game trailer', 'video game',
    'dlc', 'launch trailer', 'expansion', 'season pass', 'early access',
    // Не трейлер фильма
    'podcast', 'featurette', 'behind the scenes', 'deep dive', 'reaction', 'recap',
    'steelbook', 'blu-ray', 'anniversary', 'collector', 're-release', 'rerelease',
    // Анонс трейлера, а не сам трейлер («Bottoms up! Trailer tomorrow.»)
    'trailer tomorrow', 'trailer drops', 'trailer coming', 'trailer arrives',
    // Промо-нарезка к уже вышедшему трейлеру («Reba. Frickin. McEntire. Watch the trailer for … now!»)
    'watch the trailer', 'watch the new trailer',
    // Русские каналы: не трейлер («Отрывок «Поехали»», «Специальный ролик», «Официальный клип»)
    'отрывок', 'специальный ролик', 'клип', 'фрагмент', 'за кадром', 'интервью'
]

/**
 * Промо-ролики с хэштегом («Watch the new trailer for #RemainMovie»): короткие нарезки, полный
 * трейлер выходит отдельным роликом. Только хэштег со словом: «Official Trailer #2» — настоящий трейлер.
 */
export const EXCLUDED_TITLE_PATTERNS = [/#\p{L}/u]

/** Слово или шаблон, по которому ролик не трейлер фильма, или undefined. */
export const findExcludedTitleReason = (title: string): string | undefined => {
    const lower = title.toLowerCase()
    return EXCLUDED_TITLE_WORDS.find(word => lower.includes(word)) ??
        (EXCLUDED_TITLE_PATTERNS.some(pattern => pattern.test(title)) ? 'хэштег' : undefined)
}

/**
 * Жанры TMDB, которые не публикуются (решение владельца 20.11): ток-шоу, реалити, новости —
 * у них есть сезоны и серии, но это не сериалы; документальные фильмы и сериалы (true crime).
 */
export const EXCLUDED_TMDB_GENRES: Record<number, string> = {
    10767: 'ток-шоу',
    10764: 'реалити-шоу',
    10763: 'новости',
    99: 'документальный'
}

/** Страны производства, тайтлы которых не публикуются (решение владельца 20.11). */
export const EXCLUDED_COUNTRIES: Record<string, string> = {
    ID: 'Индонезия'
}

/**
 * Пороги известности (решение владельца 20.11: «два актёра, никто не будет смотреть»). Тайтл
 * подходит, если выполнено хоть одно: есть оценки, TMDB считает его популярным, или среди
 * первых пяти актёров есть известный. У новинок оценок нет — их вытягивают актёры: на 20.11
 * The Comeback King (Глен Пауэлл) 3.2, Killing Castro (Аль Пачино) 5.0, а Collect & Praise 1.8,
 * Living the Dream 0.3. cast — актёры TMDB по порядку (append_to_response=credits).
 */
export const WELL_KNOWN = {votes: 100, popularity: 10, castPopularity: 2}

export const isWellKnown = (media: Record<string, any>, cast: Array<{popularity?: number}> = []) =>
    Number(media.vote_count) >= WELL_KNOWN.votes ||
    Number(media.popularity) >= WELL_KNOWN.popularity ||
    cast.slice(0, 5).some(person => Number(person.popularity) >= WELL_KNOWN.castPopularity)

/**
 * Почему тайтл из TMDB не публикуется, или undefined. Проверяется полная карточка (ru-RU):
 * пост без постера пустой. Нет русского сюжета — его допишет Gemini перед публикацией
 * (russianOverview.ts), без сюжета ролик пропускается уже там.
 */
export const findUnsuitableMediaReason = (media: Record<string, any>, cast: Array<{popularity?: number}> = []): string | undefined => {
    const genre = (media.genres ?? []).find((item: {id?: number}) => EXCLUDED_TMDB_GENRES[Number(item?.id)])
    if (genre) return `не фильм и не сериал (${EXCLUDED_TMDB_GENRES[Number(genre.id)]})`
    const countries: string[] = media.origin_country?.length
        ? media.origin_country
        : (media.production_countries ?? []).map((item: {iso_3166_1?: string}) => item.iso_3166_1)
    const country = countries.find(code => EXCLUDED_COUNTRIES[code])
    if (country) return `страна: ${EXCLUDED_COUNTRIES[country]}`
    if (!media.poster_path) return 'в TMDB нет постера'
    if (!isWellKnown(media, cast)) return 'малоизвестный: нет ни оценок, ни популярности, ни известных актёров'
    return undefined
}

/**
 * Русская озвучка в названии ролика. «Субтитры» — оригинальная дорожка: такой ролик не берётся,
 * публикуется оригинал со своими субтитрами (решение владельца 20.11).
 */
export const RUSSIAN_AUDIO = ['дубляж', 'озвучка']

export const isRussianAudio = (title: string) => {
    const lower = title.toLowerCase()
    return RUSSIAN_AUDIO.some(word => lower.includes(word)) && !lower.includes('субтитр')
}

const DEFAULT_CHANNELS: WatchedChannel[] = [
    // Русские трейлеры: только дубляж и озвучка. В очереди — первыми; один фильм выходит на всех
    // четырёх, лишние копии отсеивает очередь (dropDuplicates в youtubeQueue.ts). Порядок —
    // кому отдать предпочтение при дублях.
    {id: 'UC6A-Z0jDKemh9-CwGbj5yog', name: 'KinomanTrailers', keywords: RUSSIAN_AUDIO, priority: true},
    {id: 'UCEScTo5Hk1YXsCqGW1zgQEw', name: 'топКино', keywords: RUSSIAN_AUDIO, priority: true},
    {id: 'UCbd7vzvz5wFe7r_KaW5tQUw', name: 'FRESH Trailers', keywords: RUSSIAN_AUDIO, priority: true},
    {id: 'UCnRHJsRYt_v5ZwwEK--2z9g', name: 'INS', keywords: RUSSIAN_AUDIO, priority: true},

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

export const parseChannelsEnv = (raw: string | undefined): WatchedChannel[] =>
    (raw ?? '')
        .split(',')
        .map(entry => entry.trim())
        .map(entry => {
            const priority = entry.startsWith('*')
            const [id, words] = entry.replace(/^\*/, '').split(':')
            const keywords = (words ?? '').split('|').map(word => word.trim().toLowerCase()).filter(Boolean)
            return {id: id?.trim() ?? '', name: id?.trim() ?? '', keywords: keywords.length ? keywords : TRAILER, ...(priority ? {priority} : {})}
        })
        .filter(channel => /^UC[0-9A-Za-z_-]{22}$/.test(channel.id))

export const youtubeQueueConfig = () => {
    const fromEnv = parseChannelsEnv(process.env.YOUTUBE_WATCH_CHANNELS)

    return {
        enabled: !isOff(process.env.YOUTUBE_QUEUE_ENABLED),
        devTick: !isOff(process.env.YOUTUBE_QUEUE_DEV_TICK),
        channels: fromEnv.length ? fromEnv : DEFAULT_CHANNELS,
        slots: parseSlots(process.env.YOUTUBE_QUEUE_SLOTS),
        maxAgeHours: readNumber('YOUTUBE_QUEUE_MAX_AGE_HOURS', 72, 1, 30 * 24),
        filmCooldownDays: readNumber('YOUTUBE_QUEUE_FILM_COOLDOWN_DAYS', 7, 0, 365),
        devTickMinutes: readNumber('YOUTUBE_QUEUE_TICK_MINUTES', 10, 1, 24 * 60),
        apiKey: process.env.YOUTUBE_API_KEY?.trim() || undefined
    }
}
