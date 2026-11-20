import {Markup} from 'telegraf'
import {NOTIFY_CARD} from '#server/bot/callbacks/routes'
import {ContentType} from '#server/global/engine/search/strategy/enums'
import {daysBetween, type MediaType} from '#server/global/engine/notifications/snapshot'

/**
 * Сводка обновлений по сохранённым — чистые функции: какие события показать пользователю и как
 * выглядит сообщение (Rich Message и запасной HTML).
 *
 * События идут к подписчикам, а не наоборот: событие тайтла создано один раз, здесь оно
 * раскладывается по тем, кто тайтл сохранил, — каждому только новое с момента сохранения и
 * с прошлой сводки (cutoff).
 */

export type EventRow = {
    id: number
    media_type: MediaType
    tmdb_id: number
    event_type: string
    event_key: string
    event_date: string | null
    payload: Record<string, any>
    source: string
    detected_at: string
}

export type Subscription = {
    user_id: number
    media_type: MediaType
    tmdb_id: number
    title: string | null
    genres_ids: unknown
    created_at: string
}

export type WatchRow = {
    media_type: MediaType
    tmdb_id: number
    title: string | null
    release_date: string | null
    next_episode_air_date: string | null
    next_episode: string | null
}

export type DigestCard = {mediaType: MediaType, tmdbId: number, contentType: ContentType, title: string}

export type DigestPayload = {
    rich: {blocks: any[]}
    html: string
    cards: DigestCard[]
    count: number
}

const MAX_PER_SECTION = 5
const MAX_CARDS = 3
const MAX_POSTERS = 6
const MAX_CALENDAR = 4
const POSTER_URL = 'https://image.tmdb.org/t/p/w500'

export const mediaKey = (mediaType: string, tmdbId: number | string) => `${mediaType}:${tmdbId}`

/** События пользователя: по его тайтлам, после сохранения и после прошлой сводки. */
export const eventsForUser = (events: EventRow[], subscriptions: Subscription[], cutoff: string | null): EventRow[] => {
    const since = new Map(subscriptions.map(item => [mediaKey(item.media_type, item.tmdb_id), item.created_at]))
    return events.filter(event => {
        const saved = since.get(mediaKey(event.media_type, event.tmdb_id))
        if (!saved) return false
        const detected = Date.parse(event.detected_at)
        return detected > Date.parse(saved) && (!cutoff || detected > Date.parse(cutoff))
    })
}

const ANIMATION_GENRE = 16

/** Тип контента для карточки: мультфильм / мультсериал по жанру «Анимация», иначе фильм / сериал. */
export const contentTypeOf = (mediaType: MediaType, genres: unknown): ContentType => {
    const list = Array.isArray(genres) ? genres.map(Number) : []
    const animation = list.includes(ANIMATION_GENRE)
    if (mediaType === 'movie') return animation ? ContentType.CARTOON : ContentType.MOVIE
    return animation ? ContentType.CARTOON_SERIES : ContentType.SERIES
}

/** «18.12» в этом году, «18.12.2027» в другом. */
export const shortDate = (date: string, today: string) => {
    const [year, month, day] = date.split('-')
    return `${day}.${month}${year === today.slice(0, 4) ? '' : `.${year}`}`
}

const plural = (count: number, one: string, few: string, many: string) => {
    const tens = count % 100
    const units = count % 10
    if (tens >= 11 && tens <= 14) return many
    if (units === 1) return one
    if (units >= 2 && units <= 4) return few
    return many
}

/** «5 серия», «5–7 серии», «вышел весь 3 сезон — 8 серий». */
export const episodesText = (payload: Record<string, any>): string => {
    const {season, from, to, count, wholeSeason, seasonStart, ended} = payload
    let text: string
    if (wholeSeason) text = `вышел весь ${season} сезон — ${count} ${plural(count, 'серия', 'серии', 'серий')}`
    else if (count > 1) text = `${season} сезон, ${from}–${to} серии`
    else text = `${season} сезон, ${from} серия`
    if (seasonStart && !wholeSeason) text = `старт сезона: ${text}`
    if (ended) text += ' · финал сериала'
    return text
}

type Piece = string | {code: string} | {bold: string} | {link: string, url: string}
type Line = Piece[]

const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const toRich = (line: Line) => line.map(piece =>
    typeof piece === 'string' ? piece
        : 'code' in piece ? {type: 'code', text: piece.code}
            : 'bold' in piece ? {type: 'bold', text: piece.bold}
                : {type: 'url', text: piece.link, url: piece.url})

const toHtml = (line: Line) => line.map(piece =>
    typeof piece === 'string' ? escapeHtml(piece)
        : 'code' in piece ? `<code>${escapeHtml(piece.code)}</code>`
            : 'bold' in piece ? `<b>${escapeHtml(piece.bold)}</b>`
                : `<a href="${escapeHtml(piece.url)}">${escapeHtml(piece.link)}</a>`).join('')

type Section = {title: string, lines: Line[]}

const limited = (lines: Line[]): Line[] =>
    lines.length > MAX_PER_SECTION
        ? [...lines.slice(0, MAX_PER_SECTION), [`и ещё ${lines.length - MAX_PER_SECTION} — в коллекции`]]
        : lines

/** Ближайшие даты из сохранённых: фильмы и следующие серии, до 4. */
export const upcoming = (watch: WatchRow[], today: string): Line[] =>
    watch
        .map(row => {
            const date = row.media_type === 'movie' ? row.release_date : row.next_episode_air_date
            return date && date > today ? {row, date} : null
        })
        .filter((item): item is {row: WatchRow, date: string} => Boolean(item))
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(0, MAX_CALENDAR)
        .map(({row, date}) => {
            const days = daysBetween(today, date)
            return [
                `${shortDate(date, today)} · `,
                {code: row.title ?? 'Без названия'},
                row.media_type === 'tv' && row.next_episode ? ` — ${row.next_episode}` : '',
                ` · через ${days} ${plural(days, 'день', 'дня', 'дн.')}`
            ]
        })

/**
 * Сообщение-сводка. titles — название и жанры по тайтлу (из favorites пользователя).
 * Пустой список событий — undefined (сводку не шлём; календарь сам по себе не повод).
 */
export const buildDigest = (
    {events, titles, calendar, today}: {
        events: EventRow[]
        titles: Map<string, {title: string, genres: unknown}>
        calendar: Line[]
        today: string
    }
): DigestPayload | undefined => {
    if (!events.length) return undefined

    const titleOf = (event: EventRow) => titles.get(mediaKey(event.media_type, event.tmdb_id))?.title || 'Без названия'
    const byMedia = new Map<string, EventRow[]>()
    for (const event of [...events].sort((a, b) => a.id - b.id)) {
        const key = mediaKey(event.media_type, event.tmdb_id)
        byMedia.set(key, [...(byMedia.get(key) ?? []), event])
    }

    const premieres: Line[] = []
    const episodes: Line[] = []
    const dates: Line[] = []
    const trailers: Line[] = []
    const posters: {title: string, paths: string[]}[] = []
    const order: {section: number, key: string, event: EventRow}[] = []

    for (const [key, list] of byMedia) {
        const first = list[0]!
        const title = titleOf(first)
        const premiere = list.filter(event => event.event_type === 'movie_premiere').at(-1)
        const changes = list.filter(event => event.event_type === 'release_date_changed')
        const sets = list.filter(event => event.event_type === 'release_date_set')

        if (premiere) {
            const date = premiere.event_date ?? today
            const moved = changes.find(event => event.payload?.to === date)
            premieres.push(['• ', {code: title}, ' — ',
                date === today ? 'премьера сегодня' : `вышел ${shortDate(date, today)}`,
                moved ? ` (перенесли с ${shortDate(String(moved.payload.from), today)})` : ''])
            order.push({section: 0, key, event: premiere})
        }

        for (const event of list.filter(item => item.event_type === 'tv_episodes')) {
            episodes.push(['• ', {code: title}, ` — ${episodesText(event.payload ?? {})}`])
            order.push({section: 1, key, event})
        }

        const premiereDate = premiere?.event_date
        const lastChange = changes.filter(event => event.payload?.to !== premiereDate).at(-1)
        if (lastChange) {
            // Несколько переносов за день — один пункт: с самой первой даты на последнюю.
            const from = String(changes[0]!.payload.from)
            dates.push(['• ', {code: title}, ` — перенесли: ${shortDate(from, today)} → ${shortDate(String(lastChange.payload.to), today)}`])
            order.push({section: 2, key, event: lastChange})
        } else if (!premiere && sets.length) {
            dates.push(['• ', {code: title}, ` — назначили дату: ${shortDate(String(sets.at(-1)!.payload.date), today)}`])
            order.push({section: 2, key, event: sets.at(-1)!})
        }

        const videos = list.filter(event => event.event_type === 'trailer_added')
        if (videos.length) {
            const rank = (event: EventRow) => (event.payload?.russian ? 0 : 4) + (event.payload?.teaser ? 2 : 0)
            const best = [...videos].sort((a, b) => rank(a) - rank(b) || b.id - a.id)[0]!
            const label = `${best.payload?.russian ? '🇷🇺 ' : ''}${best.payload?.teaser ? 'тизер' : 'трейлер'}`
            trailers.push(['• ', {code: title}, ' — ',
                {link: label, url: `https://www.youtube.com/watch?v=${best.payload?.key}`},
                videos.length > 1 ? ` · ещё ${videos.length - 1}` : ''])
            order.push({section: 3, key, event: best})
        }

        const images = list.filter(event => event.event_type === 'posters_added')
            .flatMap(event => (event.payload?.paths ?? []) as string[])
        if (images.length) {
            posters.push({title, paths: [...new Set(images)]})
            order.push({section: 4, key, event: list.find(item => item.event_type === 'posters_added')!})
        }
    }

    const sections: Section[] = [
        {title: '🍿 Премьеры', lines: premieres},
        {title: '📺 Новые серии', lines: episodes},
        {title: '📅 Даты', lines: dates},
        {title: '▶️ Трейлеры', lines: trailers}
    ].filter(section => section.lines.length)

    const posterCount = posters.reduce((sum, item) => sum + item.paths.length, 0)
    const count = premieres.length + episodes.length + dates.length + trailers.length + posters.length
    if (!count) return undefined

    const heading = `🎬 Обновления вашей коллекции · ${count}`
    const blocks: any[] = [{type: 'heading', size: 1, text: [heading]}]
    const html: string[] = [`<b>${escapeHtml(heading)}</b>`]

    for (const section of sections) {
        const lines = limited(section.lines)
        blocks.push({type: 'paragraph', text: [{type: 'bold', text: section.title}]})
        blocks.push(...lines.map(line => ({type: 'paragraph', text: toRich(line)})))
        html.push('', `<b>${escapeHtml(section.title)}</b>`, ...lines.map(toHtml))
    }

    if (posterCount) {
        // Свёрнутый блок с фото (решение владельца): раскрыл — посмотрел. Не больше 6 фото.
        let left = MAX_POSTERS
        const inner: any[] = []
        for (const item of posters) {
            if (left <= 0) break
            const paths = item.paths.slice(0, left)
            left -= paths.length
            const photos = paths.map(path => ({type: 'photo', photo: {type: 'photo', media: `${POSTER_URL}${path}`}}))
            inner.push({type: 'paragraph', text: [{type: 'code', text: item.title}]})
            inner.push(photos.length > 1 ? {type: 'collage', blocks: photos} : photos[0])
        }
        blocks.push({type: 'details', summary: `🖼 Новые постеры · ${posterCount}`, blocks: inner})
        html.push('', `🖼 Новые постеры: ${posterCount} — ${posters.map(item => escapeHtml(item.title)).join(', ')}`)
    }

    if (calendar.length) {
        blocks.push({type: 'divider'})
        blocks.push({type: 'paragraph', text: [{type: 'bold', text: '📆 Скоро'}]})
        blocks.push(...calendar.map(line => ({type: 'paragraph', text: toRich(line)})))
        html.push('', '<b>📆 Скоро</b>', ...calendar.map(toHtml))
    }

    const cards: DigestCard[] = []
    for (const {key} of order.sort((a, b) => a.section - b.section)) {
        if (cards.length >= MAX_CARDS) break
        if (cards.some(card => mediaKey(card.mediaType, card.tmdbId) === key)) continue
        const [mediaType, id] = key.split(':') as [MediaType, string]
        const info = titles.get(key)
        cards.push({mediaType, tmdbId: Number(id), contentType: contentTypeOf(mediaType, info?.genres), title: info?.title || 'Без названия'})
    }

    return {rich: {blocks}, html: html.join('\n'), cards, count}
}

const shortTitle = (title: string, max = 22) => title.length > max ? `${title.slice(0, max - 1)}…` : title

/** Кнопки сводки: «🎬 Название» на главные события (новым сообщением) и «📦 Коллекция». */
export const digestKeyboard = (cards: DigestCard[]) => ({
    inline_keyboard: [
        ...cards.map(card => [Markup.button.callback(`🎬 ${shortTitle(card.title)}`, NOTIFY_CARD.encode({
            mediaType: card.mediaType,
            mediaId: card.tmdbId,
            contentType: card.contentType
        }))]),
        [Markup.button.switchToCurrentChat('📦 Коллекция', '#collection')]
    ]
})
