/**
 * Сравнение состояния тайтла с прошлым снимком — чистые функции, без базы и TMDB.
 *
 * Тайтл проверяется один раз на всех подписчиков (media_watch, одна строка на тайтл), событие
 * создаётся один раз; кому его показать, решает сводка (digest.ts) по favorites.
 *
 * Правила (решения владельца и консультация 21.11):
 * - первый снимок — без событий (иначе после запуска пришли бы все старые новости);
 * - события только из allowlist: перенос или назначение даты фильма, новые серии, новый трейлер
 *   или тизер, новые постеры любого языка. Рейтинг, описание, порядок картинок — не события;
 * - перенос даты и новые постеры — только после повторной проверки (pending): TMDB правят руками,
 *   случайная правка через 12 часов обычно уже исправлена;
 * - дата пропала — молчим; дата уже прошла — молча обновляем;
 * - серии одной даты — одно событие («5–7 серии», «весь 3 сезон»).
 */

export type MediaType = 'movie' | 'tv'

export type Episode = {id: number, season: number, episode: number, airDate: string | null}

export type Snapshot = {
    /** Фильм: выбранная дата выхода (подтверждённая). */
    release?: string | null
    digital?: string | null
    /** Известные ключи трейлеров и тизеров YouTube. */
    trailers?: string[]
    /** Известные постеры (file_path); undefined — постеры ещё ни разу не загружались. */
    posters?: string[]
    imagesCheckedAt?: string
    lastEpisode?: Episode | null
    status?: string | null
    pending?: {
        release?: {value: string | null, since: string}
        posters?: string[]
    }
}

export type NewEvent = {
    eventType: 'release_date_changed' | 'release_date_set' | 'tv_episodes' | 'trailer_added' | 'posters_added' | 'movie_premiere'
    eventKey: string
    eventDate: string | null
    payload: Record<string, unknown>
    source: 'tmdb' | 'youtube_queue' | 'reel_job' | 'calendar'
}

/** Колонки media_watch, которые читают календарь и планировщик. */
export type WatchColumns = {
    title: string | null
    poster_path: string | null
    status: string | null
    release_date: string | null
    digital_date: string | null
    next_episode_air_date: string | null
    next_episode: string | null
    last_episode_id: number | null
}

const DAY_MS = 24 * 60 * 60_000
const HOUR_MS = 60 * 60_000
/** Известные ключи храним все (у крупных премьер постеров 300+, иначе «лишние» казались бы новыми). */
const MAX_KNOWN_TRAILERS = 500
const MAX_KNOWN_POSTERS = 3000
const MAX_POSTERS_IN_EVENT = 6
/** Больше стольких новых постеров разом — пересборка данных TMDB, а не новость: запоминаем молча. */
const MAX_FRESH_POSTERS = 12
/** Трейлер, опубликованный раньше прошлой проверки больше чем на столько, — не новость. */
const TRAILER_FRESH_MS = 7 * DAY_MS

const date10 = (value: unknown): string | null => {
    const text = typeof value === 'string' ? value.slice(0, 10) : ''
    return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null
}

export const daysBetween = (from: string, to: string) =>
    Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS)

/** Дата по Москве: «2026-11-21». */
export const moscowDate = (now: Date) =>
    new Intl.DateTimeFormat('en-CA', {timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit'}).format(now)

/** Минуты от полуночи по Москве. */
export const moscowMinutes = (now: Date) => {
    const parts = new Intl.DateTimeFormat('en-GB', {timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'}).formatToParts(now)
    const part = (type: string) => Number(parts.find(item => item.type === type)?.value ?? 0)
    return part('hour') * 60 + part('minute')
}

/**
 * Дата фильма: Россия, кинопрокат (тип 3) → Россия, ограниченный прокат (тип 2) → общая дата TMDB.
 * Цифровой релиз — Россия, тип 4. Из нескольких дат одного типа — самая ранняя.
 */
export const pickMovieDates = (movie: any): {release: string | null, digital: string | null} => {
    const ru = (movie?.release_dates?.results ?? []).find((item: any) => item?.iso_3166_1 === 'RU')
    const ofType = (type: number) => (ru?.release_dates ?? [])
        .filter((item: any) => Number(item?.type) === type)
        .map((item: any) => date10(item?.release_date))
        .filter(Boolean)
        .sort()[0] ?? null
    return {
        release: ofType(3) ?? ofType(2) ?? date10(movie?.release_date),
        digital: ofType(4)
    }
}

const toEpisode = (raw: any): Episode | null =>
    raw && Number(raw.id)
        ? {id: Number(raw.id), season: Number(raw.season_number) || 0, episode: Number(raw.episode_number) || 0, airDate: date10(raw.air_date)}
        : null

export type Trailer = {key: string, language: string, teaser: boolean, name: string, publishedAt: string | null}

/** Трейлеры и тизеры YouTube на русском и английском (тизер считается трейлером — решение владельца). */
export const pickTrailers = (videos: any[]): Trailer[] =>
    (videos ?? [])
        .filter(video =>
            video?.site === 'YouTube' &&
            /^[0-9A-Za-z_-]{11}$/.test(String(video?.key)) &&
            (video?.type === 'Trailer' || video?.type === 'Teaser') &&
            (video?.iso_639_1 === 'ru' || video?.iso_639_1 === 'en'))
        .map(video => ({
            key: String(video.key),
            language: String(video.iso_639_1),
            teaser: video.type === 'Teaser',
            name: String(video.name ?? ''),
            publishedAt: typeof video.published_at === 'string' ? video.published_at : null
        }))

export const episodeLabel = (episode: Episode | null) =>
    episode ? `${episode.season} сезон, ${episode.episode} серия` : null

/**
 * Новые серии между прошлой и текущей последней вышедшей. seasonEpisodes — серии сезона текущей
 * (из /tv/{id}/season/{n}); без них событие одно, по самой последней серии. Серии одной даты — одно
 * событие: «5 серия», «5–7 серии», «весь сезон» (все серии сезона вышли в один день).
 */
export const newEpisodeEvents = (
    {mediaType = 'tv', tmdbId, previous, current, seasonEpisodes, today, ended}: {
        mediaType?: MediaType
        tmdbId: number
        previous: Episode | null | undefined
        current: Episode | null
        seasonEpisodes?: Episode[]
        today: string
        ended?: boolean
    }
): NewEvent[] => {
    if (!current || !previous || current.id === previous.id) return []
    // TMDB откатил данные (последняя серия раньше прежней) — не событие.
    if (current.season < previous.season || (current.season === previous.season && current.episode <= previous.episode)) return []

    const isNew = (episode: Episode) =>
        episode.season === current.season &&
        (current.season > previous.season || episode.episode > previous.episode) &&
        episode.episode <= current.episode &&
        (!episode.airDate || episode.airDate <= today)

    const fresh = (seasonEpisodes?.length ? seasonEpisodes.filter(isNew) : [current])
        .sort((a, b) => a.episode - b.episode)
    if (!fresh.length) return []

    const seasonTotal = seasonEpisodes?.filter(episode => episode.season === current.season && episode.episode > 0).length ?? 0
    const groups = new Map<string, Episode[]>()
    for (const episode of fresh) {
        const key = episode.airDate ?? current.airDate ?? today
        groups.set(key, [...(groups.get(key) ?? []), episode])
    }

    const last = [...groups.keys()].sort().at(-1)
    return [...groups.entries()].map(([airDate, episodes]) => {
        const from = episodes[0]!.episode
        const to = episodes.at(-1)!.episode
        return {
            eventType: 'tv_episodes' as const,
            eventKey: `${mediaType}:${tmdbId}:ep:${current.season}:${from}-${to}`,
            eventDate: airDate,
            payload: {
                season: current.season,
                from,
                to,
                count: episodes.length,
                wholeSeason: from === 1 && seasonTotal > 1 && episodes.length === seasonTotal,
                seasonStart: from === 1,
                ...(ended && airDate === last ? {ended: true} : {})
            },
            source: 'tmdb' as const
        }
    })
}

export type DetailsInput = {
    mediaType: MediaType
    tmdbId: number
    /** Ответ /movie/{id} или /tv/{id} с append_to_response=videos (и release_dates у фильма). */
    details: any
    /** Ответ /{type}/{id}/images без языка; undefined — постеры в этот раз не проверялись. */
    images?: any
    /** Серии сезона текущей последней серии (сериал, если она сменилась). */
    seasonEpisodes?: Episode[]
    previous: Snapshot | null
    previousCheckedAt: string | null
    now: Date
}

export type CompareResult = {
    snapshot: Snapshot
    columns: WatchColumns
    events: NewEvent[]
    nextCheckAt: string
    baseline: boolean
}

/** Когда снова проверить тайтл в TMDB (решение по близости даты, см. TASKS.md). */
export const nextCheckDelayMs = (
    {mediaType, columns, snapshot, today}: {mediaType: MediaType, columns: WatchColumns, snapshot: Snapshot, today: string}
): number => {
    if (snapshot.pending?.release) return 12 * HOUR_MS
    if (mediaType === 'movie') {
        if (!columns.release_date) return 7 * DAY_MS
        const days = daysBetween(today, columns.release_date)
        if (days < -14) return 30 * DAY_MS
        if (days <= 30) return DAY_MS
        if (days <= 90) return 3 * DAY_MS
        return 7 * DAY_MS
    }
    if (columns.status === 'Ended' || columns.status === 'Canceled') return 30 * DAY_MS
    const next = columns.next_episode_air_date ? daysBetween(today, columns.next_episode_air_date) : undefined
    const lastAired = snapshot.lastEpisode?.airDate ? daysBetween(snapshot.lastEpisode.airDate, today) : undefined
    if ((next !== undefined && next <= 7) || (lastAired !== undefined && lastAired <= 2)) return DAY_MS
    return 7 * DAY_MS
}

/** Как часто проверять постеры (отдельный запрос /images без языка). */
export const imagesIntervalMs = ({mediaType, columns, snapshot, today}: {mediaType: MediaType, columns: WatchColumns, snapshot: Snapshot, today: string}) => {
    if (snapshot.pending?.posters?.length) return 12 * HOUR_MS
    if (mediaType === 'movie' && columns.release_date) {
        const days = daysBetween(today, columns.release_date)
        if (days < -60) return 30 * DAY_MS
        if (days <= 30) return 3 * DAY_MS
    }
    if (mediaType === 'tv' && (columns.status === 'Ended' || columns.status === 'Canceled')) return 30 * DAY_MS
    return 7 * DAY_MS
}

/** Пора ли в эту проверку загрузить постеры. */
export const imagesDue = (
    {mediaType, columns, snapshot, now}: {mediaType: MediaType, columns: WatchColumns | null, snapshot: Snapshot | null, now: Date}
): boolean => {
    if (!snapshot?.imagesCheckedAt || !columns) return true
    const interval = imagesIntervalMs({mediaType, columns, snapshot, today: moscowDate(now)})
    // Запас в час: проверка идёт по часовому таймеру.
    return Date.parse(snapshot.imagesCheckedAt) + interval - HOUR_MS <= now.getTime()
}

/** Сравнить ответ TMDB с прошлым снимком: события, новый снимок, колонки и следующая проверка. */
export const compareSnapshot = (input: DetailsInput): CompareResult => {
    const {mediaType, tmdbId, details, images, previous, now} = input
    const nowIso = now.toISOString()
    const today = moscowDate(now)
    const prefix = `${mediaType}:${tmdbId}`
    const events: NewEvent[] = []
    const baseline = !previous

    const trailers = pickTrailers(details?.videos?.results ?? [])
    const lastEpisode = mediaType === 'tv' ? toEpisode(details?.last_episode_to_air) : null
    const nextEpisode = mediaType === 'tv' ? toEpisode(details?.next_episode_to_air) : null
    const dates = mediaType === 'movie' ? pickMovieDates(details) : {release: null, digital: null}
    const status = typeof details?.status === 'string' ? details.status : null

    const snapshot: Snapshot = {
        ...(previous ?? {}),
        status,
        digital: dates.digital,
        ...(mediaType === 'tv' ? {lastEpisode} : {})
    }
    const pending: NonNullable<Snapshot['pending']> = {...(previous?.pending ?? {})}

    // Дата фильма.
    if (mediaType === 'movie') {
        if (baseline || previous.release === undefined) {
            snapshot.release = dates.release
            delete pending.release
        } else if (previous.release === dates.release) {
            delete pending.release
        } else if (pending.release && pending.release.value === dates.release) {
            const old = previous.release
            snapshot.release = dates.release
            delete pending.release
            if (dates.release && dates.release >= today) {
                if (!old) {
                    events.push({eventType: 'release_date_set', eventKey: `${prefix}:date:set:${dates.release}`, eventDate: dates.release, payload: {date: dates.release}, source: 'tmdb'})
                } else if (old >= today) {
                    events.push({eventType: 'release_date_changed', eventKey: `${prefix}:date:${old}>${dates.release}`, eventDate: dates.release, payload: {from: old, to: dates.release}, source: 'tmdb'})
                }
            }
        } else {
            pending.release = {value: dates.release, since: nowIso}
        }
    }

    // Новые серии.
    if (mediaType === 'tv' && !baseline) {
        events.push(...newEpisodeEvents({
            tmdbId,
            previous: previous.lastEpisode,
            current: lastEpisode,
            seasonEpisodes: input.seasonEpisodes,
            today,
            ended: status === 'Ended'
        }))
    }

    // Трейлеры и тизеры.
    const knownTrailers = new Set(previous?.trailers ?? [])
    if (!baseline && previous.trailers) {
        const since = input.previousCheckedAt ? Date.parse(input.previousCheckedAt) - TRAILER_FRESH_MS : 0
        for (const trailer of trailers) {
            if (knownTrailers.has(trailer.key)) continue
            if (trailer.publishedAt && Date.parse(trailer.publishedAt) < since) continue
            events.push({
                eventType: 'trailer_added',
                eventKey: `${prefix}:trailer:${trailer.key}`,
                eventDate: trailer.publishedAt?.slice(0, 10) ?? today,
                payload: {key: trailer.key, language: trailer.language, teaser: trailer.teaser, name: trailer.name, russian: trailer.language === 'ru'},
                source: 'tmdb'
            })
        }
    }
    snapshot.trailers = [...new Set([...trailers.map(trailer => trailer.key), ...knownTrailers])].slice(0, MAX_KNOWN_TRAILERS)

    // Постеры любого языка: новые file_path, подтверждённые второй проверкой.
    if (images) {
        const current = [...new Set<string>((images?.posters ?? [])
            .map((poster: any) => String(poster?.file_path ?? ''))
            .filter((path: string) => path.startsWith('/')))]
        if (baseline || !previous.posters) {
            snapshot.posters = current.slice(0, MAX_KNOWN_POSTERS)
            delete pending.posters
        } else {
            const known = new Set(previous.posters)
            const confirmed = (pending.posters ?? []).filter(path => current.includes(path) && !known.has(path))
            const fresh = current.filter(path => !known.has(path) && !(pending.posters ?? []).includes(path))
            if (fresh.length > MAX_FRESH_POSTERS) {
                snapshot.posters = [...new Set([...current, ...previous.posters])].slice(0, MAX_KNOWN_POSTERS)
                delete pending.posters
            } else {
                if (confirmed.length) {
                    events.push({
                        eventType: 'posters_added',
                        eventKey: `${prefix}:posters:${confirmed[0]}`,
                        eventDate: today,
                        payload: {paths: confirmed.slice(0, MAX_POSTERS_IN_EVENT), count: confirmed.length},
                        source: 'tmdb'
                    })
                }
                snapshot.posters = [...confirmed, ...previous.posters].slice(0, MAX_KNOWN_POSTERS)
                if (fresh.length) pending.posters = fresh
                else delete pending.posters
            }
        }
        snapshot.imagesCheckedAt = nowIso
    }

    if (Object.keys(pending).length) snapshot.pending = pending
    else delete snapshot.pending

    const columns: WatchColumns = {
        title: String(details?.title ?? details?.name ?? '') || null,
        poster_path: typeof details?.poster_path === 'string' ? details.poster_path : null,
        status,
        release_date: mediaType === 'movie' ? snapshot.release ?? null : null,
        digital_date: mediaType === 'movie' ? dates.digital : null,
        next_episode_air_date: nextEpisode?.airDate ?? null,
        next_episode: episodeLabel(nextEpisode),
        last_episode_id: lastEpisode?.id ?? null
    }

    const coreDelay = nextCheckDelayMs({mediaType, columns, snapshot, today})
    const imagesAt = snapshot.imagesCheckedAt
        ? Date.parse(snapshot.imagesCheckedAt) + imagesIntervalMs({mediaType, columns, snapshot, today})
        : now.getTime()
    const nextCheckAt = new Date(Math.max(now.getTime() + HOUR_MS / 2, Math.min(now.getTime() + coreDelay, imagesAt))).toISOString()

    return {snapshot, columns, events: baseline ? [] : events, nextCheckAt, baseline}
}

/** Премьеры сегодня — из уже известной даты, без TMDB. */
export const premiereEvent = (tmdbId: number, date: string): NewEvent => ({
    eventType: 'movie_premiere',
    eventKey: `movie:${tmdbId}:premiere:${date}`,
    eventDate: date,
    payload: {date},
    source: 'calendar'
})
