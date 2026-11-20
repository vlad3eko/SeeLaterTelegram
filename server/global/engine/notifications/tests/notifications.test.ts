import {test} from 'node:test'
import assert from 'node:assert/strict'
import {
    compareSnapshot,
    imagesDue,
    moscowDate,
    newEpisodeEvents,
    nextCheckDelayMs,
    pickMovieDates,
    pickTrailers,
    type Snapshot
} from '../snapshot'
import {buildDigest, contentTypeOf, digestKeyboard, episodesText, eventsForUser, upcoming, type EventRow} from '../digest'
import {NOTIFY_BACK, NOTIFY_CARD, NOTIFY_MORE} from '../../../../bot/callbacks/routes'

const now = new Date('2026-11-21T07:00:00Z') // 10:00 МСК
const DAY = 24 * 60 * 60_000

const movie = (release: string, extra: Record<string, unknown> = {}) => ({
    title: 'Дюна 3',
    status: 'Post Production',
    release_date: '2026-12-01',
    release_dates: {results: [{iso_3166_1: 'RU', release_dates: [{type: 3, release_date: `${release}T00:00:00.000Z`}]}]},
    videos: {results: []},
    ...extra
})

const video = (key: string, extra: Record<string, unknown> = {}) =>
    ({site: 'YouTube', key, type: 'Trailer', iso_639_1: 'ru', name: 'Трейлер', published_at: '2026-11-20T10:00:00Z', ...extra})

test('дата фильма: Россия, прокат → Россия, ограниченный → общая; цифровой отдельно', () => {
    assert.deepEqual(pickMovieDates(movie('2026-12-18')), {release: '2026-12-18', digital: null})
    assert.deepEqual(pickMovieDates({release_date: '2026-12-01', release_dates: {results: [
        {iso_3166_1: 'US', release_dates: [{type: 3, release_date: '2026-11-25T00:00:00Z'}]},
        {iso_3166_1: 'RU', release_dates: [{type: 2, release_date: '2026-12-10T00:00:00Z'}, {type: 4, release_date: '2027-02-01T00:00:00Z'}]}
    ]}}), {release: '2026-12-10', digital: '2027-02-01'})
    assert.deepEqual(pickMovieDates({release_date: '2026-12-01'}), {release: '2026-12-01', digital: null})
    assert.equal(moscowDate(new Date('2026-11-21T22:30:00Z')), '2026-11-22')
})

test('трейлеры: тизер считается, другие языки и не YouTube — нет', () => {
    const list = pickTrailers([
        video('AAAAAAAAAAA'),
        video('BBBBBBBBBBB', {type: 'Teaser', iso_639_1: 'en'}),
        video('CCCCCCCCCCC', {iso_639_1: 'de'}),
        video('DDDDDDDDDDD', {site: 'Vimeo'}),
        video('EEEEEEEEEEE', {type: 'Featurette'})
    ])
    assert.deepEqual(list.map(item => [item.key, item.teaser]), [['AAAAAAAAAAA', false], ['BBBBBBBBBBB', true]])
})

test('первый снимок — без событий; постеры и трейлеры запоминаются', () => {
    const result = compareSnapshot({
        mediaType: 'movie', tmdbId: 1, details: movie('2026-12-18', {videos: {results: [video('AAAAAAAAAAA')]}}),
        images: {posters: [{file_path: '/a.jpg'}, {file_path: '/b.jpg'}]}, previous: null, previousCheckedAt: null, now
    })
    assert.equal(result.baseline, true)
    assert.deepEqual(result.events, [])
    assert.equal(result.snapshot.release, '2026-12-18')
    assert.deepEqual(result.snapshot.trailers, ['AAAAAAAAAAA'])
    assert.deepEqual(result.snapshot.posters, ['/a.jpg', '/b.jpg'])
    assert.equal(result.columns.release_date, '2026-12-18')
})

test('перенос даты: событие только после повторной проверки', () => {
    const previous: Snapshot = {release: '2026-12-18', trailers: [], posters: [], imagesCheckedAt: now.toISOString()}
    const first = compareSnapshot({mediaType: 'movie', tmdbId: 7, details: movie('2026-12-25'), previous, previousCheckedAt: now.toISOString(), now})
    assert.deepEqual(first.events, [])
    assert.equal(first.snapshot.release, '2026-12-18')
    assert.equal(first.snapshot.pending?.release?.value, '2026-12-25')
    assert.equal(Date.parse(first.nextCheckAt) - now.getTime(), 12 * 60 * 60_000)

    const later = new Date(now.getTime() + 12 * 60 * 60_000)
    const second = compareSnapshot({mediaType: 'movie', tmdbId: 7, details: movie('2026-12-25'), previous: first.snapshot, previousCheckedAt: now.toISOString(), now: later})
    assert.deepEqual(second.events.map(event => [event.eventType, event.eventKey, event.payload]),
        [['release_date_changed', 'movie:7:date:2026-12-18>2026-12-25', {from: '2026-12-18', to: '2026-12-25'}]])
    assert.equal(second.snapshot.release, '2026-12-25')
    assert.equal(second.snapshot.pending, undefined)

    // Правку вернули до подтверждения — молчим.
    const reverted = compareSnapshot({mediaType: 'movie', tmdbId: 7, details: movie('2026-12-18'), previous: first.snapshot, previousCheckedAt: now.toISOString(), now: later})
    assert.deepEqual(reverted.events, [])
    assert.equal(reverted.snapshot.pending, undefined)
})

test('дата: назначили — событие; пропала или в прошлом — молча', () => {
    const noDate = {release_date: '', title: 'X', videos: {results: []}}
    const set1 = compareSnapshot({mediaType: 'movie', tmdbId: 2, details: movie('2027-03-01'), previous: {release: null, trailers: []}, previousCheckedAt: null, now})
    const set2 = compareSnapshot({mediaType: 'movie', tmdbId: 2, details: movie('2027-03-01'), previous: set1.snapshot, previousCheckedAt: null, now})
    assert.equal(set2.events[0]?.eventType, 'release_date_set')

    const gone1 = compareSnapshot({mediaType: 'movie', tmdbId: 3, details: noDate, previous: {release: '2026-12-18', trailers: []}, previousCheckedAt: null, now})
    const gone2 = compareSnapshot({mediaType: 'movie', tmdbId: 3, details: noDate, previous: gone1.snapshot, previousCheckedAt: null, now})
    assert.deepEqual(gone2.events, [])
    assert.equal(gone2.snapshot.release, null)

    const past1 = compareSnapshot({mediaType: 'movie', tmdbId: 4, details: movie('2026-10-02'), previous: {release: '2026-10-01', trailers: []}, previousCheckedAt: null, now})
    const past2 = compareSnapshot({mediaType: 'movie', tmdbId: 4, details: movie('2026-10-02'), previous: past1.snapshot, previousCheckedAt: null, now})
    assert.deepEqual(past2.events, [])
})

test('постеры любого языка: новый — после подтверждения; порядок не событие', () => {
    const previous: Snapshot = {release: '2026-12-18', trailers: [], posters: ['/a.jpg', '/b.jpg'], imagesCheckedAt: now.toISOString()}
    const reordered = compareSnapshot({mediaType: 'movie', tmdbId: 5, details: movie('2026-12-18'), images: {posters: [{file_path: '/b.jpg'}, {file_path: '/a.jpg'}]}, previous, previousCheckedAt: null, now})
    assert.deepEqual(reordered.events, [])
    assert.equal(reordered.snapshot.pending, undefined)

    const images = {posters: [{file_path: '/a.jpg'}, {file_path: '/new.jpg', iso_639_1: 'ko'}, {file_path: '/b.jpg'}]}
    const first = compareSnapshot({mediaType: 'movie', tmdbId: 5, details: movie('2026-12-18'), images, previous, previousCheckedAt: null, now})
    assert.deepEqual(first.events, [])
    assert.deepEqual(first.snapshot.pending?.posters, ['/new.jpg'])
    const second = compareSnapshot({mediaType: 'movie', tmdbId: 5, details: movie('2026-12-18'), images, previous: first.snapshot, previousCheckedAt: null, now})
    assert.deepEqual(second.events.map(event => [event.eventType, event.payload]), [['posters_added', {paths: ['/new.jpg'], count: 1}]])
    assert.equal(second.snapshot.posters?.[0], '/new.jpg')
    // Пересборка данных TMDB (десятки «новых» разом) — молча.
    const flood = {posters: Array.from({length: 20}, (_, index) => ({file_path: `/f${index}.jpg`}))}
    const silent = compareSnapshot({mediaType: 'movie', tmdbId: 5, details: movie('2026-12-18'), images: flood, previous, previousCheckedAt: null, now})
    assert.deepEqual(silent.events, [])
    assert.equal(silent.snapshot.pending, undefined)
    assert.equal(silent.snapshot.posters?.length, 22)
    // Без загрузки картинок в этот раз постеры не трогаются.
    const skip = compareSnapshot({mediaType: 'movie', tmdbId: 5, details: movie('2026-12-18'), previous: first.snapshot, previousCheckedAt: null, now})
    assert.deepEqual(skip.snapshot.pending?.posters, ['/new.jpg'])
})

test('трейлер: новый ключ — событие, старый опубликованный — нет', () => {
    const previous: Snapshot = {release: '2026-12-18', trailers: ['AAAAAAAAAAA']}
    const result = compareSnapshot({
        mediaType: 'movie', tmdbId: 6, now, previous, previousCheckedAt: new Date(now.getTime() - DAY).toISOString(),
        details: movie('2026-12-18', {videos: {results: [
            video('AAAAAAAAAAA'),
            video('BBBBBBBBBBB', {type: 'Teaser'}),
            video('CCCCCCCCCCC', {published_at: '2024-01-01T00:00:00Z'})
        ]}})
    })
    assert.deepEqual(result.events.map(event => [event.eventKey, event.payload.teaser]), [['movie:6:trailer:BBBBBBBBBBB', true]])
    assert.ok(result.snapshot.trailers?.includes('CCCCCCCCCCC'))
})

test('серии: пачка одной даты — одно событие, весь сезон, финал; откат — не событие', () => {
    const ep = (episode: number, airDate: string, season = 2) => ({id: season * 100 + episode, season, episode, airDate})
    const season = [ep(1, '2026-11-01'), ep(2, '2026-11-08'), ep(3, '2026-11-15'), ep(4, '2026-11-21'), ep(5, '2026-11-21'), ep(6, '2026-11-28')]
    const events = newEpisodeEvents({tmdbId: 9, previous: ep(2, '2026-11-08'), current: ep(5, '2026-11-21'), seasonEpisodes: season, today: '2026-11-21'})
    assert.deepEqual(events.map(event => [event.eventKey, event.payload.from, event.payload.to, event.payload.count]),
        [['tv:9:ep:2:3-3', 3, 3, 1], ['tv:9:ep:2:4-5', 4, 5, 2]])

    const whole = [1, 2, 3, 4, 5, 6, 7, 8].map(number => ep(number, '2026-11-20', 3))
    const binge = newEpisodeEvents({tmdbId: 9, previous: ep(10, '2025-05-01', 2), current: ep(8, '2026-11-20', 3), seasonEpisodes: whole, today: '2026-11-21', ended: true})
    assert.equal(binge.length, 1)
    assert.equal(episodesText(binge[0]!.payload), 'вышел весь 3 сезон — 8 серий · финал сериала')

    assert.deepEqual(newEpisodeEvents({tmdbId: 9, previous: ep(5, '2026-11-21'), current: ep(4, '2026-11-21'), today: '2026-11-21'}), [])
    assert.equal(episodesText({season: 2, from: 1, to: 1, count: 1, seasonStart: true}), 'старт сезона: 2 сезон, 1 серия')
    assert.equal(episodesText({season: 2, from: 5, to: 7, count: 3}), '2 сезон, 5–7 серии')
})

test('частота проверки: по близости даты', () => {
    const base = {title: null, poster_path: null, status: null, digital_date: null, next_episode_air_date: null, next_episode: null, last_episode_id: null}
    const delay = (mediaType: 'movie' | 'tv', columns: Record<string, unknown>) =>
        nextCheckDelayMs({mediaType, columns: {...base, release_date: null, ...columns} as any, snapshot: {}, today: '2026-11-21'}) / DAY
    assert.equal(delay('movie', {release_date: '2026-12-10'}), 1)
    assert.equal(delay('movie', {release_date: '2027-01-30'}), 3)
    assert.equal(delay('movie', {release_date: '2027-06-01'}), 7)
    assert.equal(delay('movie', {}), 7)
    assert.equal(delay('movie', {release_date: '2026-09-01'}), 30)
    assert.equal(delay('tv', {next_episode_air_date: '2026-11-25'}), 1)
    assert.equal(delay('tv', {}), 7)
    assert.equal(delay('tv', {status: 'Ended'}), 30)
    assert.equal(imagesDue({mediaType: 'movie', columns: null, snapshot: null, now}), true)
})

const event = (id: number, fields: Partial<EventRow>): EventRow => ({
    id, media_type: 'movie', tmdb_id: 1, event_type: 'movie_premiere', event_key: `k${id}`, event_date: '2026-11-21',
    payload: {}, source: 'tmdb', detected_at: '2026-11-21T05:00:00Z', ...fields
})

test('события подписчику: только после сохранения и после прошлой сводки', () => {
    const events = [
        event(1, {tmdb_id: 1, detected_at: '2026-11-10T00:00:00Z'}),
        event(2, {tmdb_id: 1, detected_at: '2026-11-21T05:00:00Z'}),
        event(3, {tmdb_id: 2, detected_at: '2026-11-21T05:00:00Z'}),
        event(4, {tmdb_id: 3, media_type: 'tv', detected_at: '2026-11-21T05:00:00Z'})
    ]
    const subs = [
        {user_id: 1, media_type: 'movie' as const, tmdb_id: 1, title: 'A', genres_ids: [], created_at: '2026-11-15T00:00:00Z'},
        {user_id: 1, media_type: 'movie' as const, tmdb_id: 3, title: 'C', genres_ids: [], created_at: '2026-11-01T00:00:00Z'}
    ]
    assert.deepEqual(eventsForUser(events, subs, null).map(item => item.id), [2])
    assert.deepEqual(eventsForUser(events, subs, '2026-11-21T06:00:00Z').map(item => item.id), [])
})

test('сводка: разделы, склейка премьеры с переносом, постеры в свёрнутом блоке, кнопки', () => {
    const titles = new Map<string, {title: string, genres: unknown, poster?: string}>([
        ['movie:1', {title: 'Дюна 3', genres: [878], poster: '/dune.jpg'}],
        ['tv:2', {title: 'Разделение', genres: [18], poster: '/sev.jpg'}],
        ['movie:3', {title: 'Аватар 4', genres: [12]}],
        ['movie:4', {title: 'Зверополис 2', genres: [16]}]
    ])
    const payload = buildDigest({
        today: '2026-11-21',
        titles,
        calendar: upcoming([{media_type: 'movie', tmdb_id: 3, title: 'Аватар 4', release_date: '2026-12-25', next_episode_air_date: null, next_episode: null}], '2026-11-21'),
        events: [
            event(1, {tmdb_id: 1, event_type: 'release_date_changed', payload: {from: '2026-12-25', to: '2026-11-21'}}),
            event(2, {tmdb_id: 1, event_type: 'movie_premiere', event_date: '2026-11-21'}),
            event(3, {tmdb_id: 2, media_type: 'tv', event_type: 'tv_episodes', payload: {season: 2, from: 5, to: 5, count: 1}}),
            event(4, {tmdb_id: 3, event_type: 'release_date_changed', payload: {from: '2026-12-18', to: '2026-12-25'}}),
            event(5, {tmdb_id: 4, event_type: 'trailer_added', payload: {key: 'AAAAAAAAAAA', teaser: true}}),
            event(6, {tmdb_id: 4, event_type: 'trailer_added', payload: {key: 'BBBBBBBBBBB', russian: true}}),
            event(7, {tmdb_id: 4, event_type: 'posters_added', payload: {paths: ['/p1.jpg', '/p2.jpg']}})
        ]
    })!
    assert.ok(payload)
    assert.equal(payload.count, 5)
    assert.equal(payload.html, [
        '<b>🎬 Обновления коллекции</b>', '<i>Суббота, 21 ноября · 5 новостей</i>',
        '', '<b>🍿 Премьеры</b>', '• <code>Дюна 3</code> — премьера сегодня (перенесли с 25.12)',
        '', '<b>📺 Новые серии</b>', '• <code>Разделение</code> — 2 сезон, 5 серия',
        '', '<b>📅 Даты</b>', '• <code>Аватар 4</code> — перенесли: 18.12 → 25.12',
        '', '<b>▶️ Трейлеры</b>', '• <code>Зверополис 2</code> — <a href="https://www.youtube.com/watch?v=BBBBBBBBBBB">🇷🇺 трейлер</a> · ещё 1',
        '', '<b>🖼 Новые постеры</b>', 'Зверополис 2',
        '', '<b>📆 Скоро</b>', '25.12 · <code>Аватар 4</code> · через 34 дня'
    ].join('\n'))

    const blocks = payload.rich.blocks
    // Обложка — коллаж постеров главных тайтлов; разделы — свёрнутые блоки «Название · N».
    assert.equal(blocks[0].type, 'collage')
    assert.equal(blocks[0].blocks[0].photo.media, 'https://image.tmdb.org/t/p/w342/dune.jpg')
    const sections = blocks.filter((block: any) => block.type === 'details')
    assert.deepEqual(sections.map((block: any) => [block.summary[0].text, block.summary[1]]),
        [['🍿 Премьеры', ' · 1'], ['📺 Новые серии', ' · 1'], ['📅 Даты', ' · 1'], ['▶️ Трейлеры', ' · 1'], ['🖼 Новые постеры', ' · 2'], ['📆 Скоро', ' · 1']])
    assert.ok(sections.every((block: any) => block.summary[0].type === 'bold' && !block.is_open))
    assert.equal(sections[0].blocks[0].type, 'list')
    assert.deepEqual(sections[2].blocks[0].cells[1].map((cell: any) => cell.text), ['Аватар 4', '18.12', '25.12'])
    assert.deepEqual(sections[5].blocks[0].cells[1].map((cell: any) => cell.text), ['25.12', 'Аватар 4', '34 дня'])
    assert.equal(blocks.at(-1).type, 'footer')
    // Постеры: внутри раздела — свой свёрнутый блок у каждого тайтла.
    const details = sections[4].blocks[0]
    assert.equal(details.type, 'details')
    assert.deepEqual(details.summary, [{type: 'code', text: 'Зверополис 2'}, ' · 2 постера'])
    assert.equal(details.blocks[0].type, 'collage')
    assert.equal(details.blocks[0].blocks[0].photo.media, 'https://image.tmdb.org/t/p/w500/p1.jpg')
    assert.deepEqual(payload.cards.map(card => [card.title, card.contentType]),
        [['Дюна 3', 'movie'], ['Разделение', 'series'], ['Аватар 4', 'movie'], ['Зверополис 2', 'cartoon']])

    const keyboard = digestKeyboard(payload.cards, 42)
    assert.equal(keyboard.inline_keyboard.length, 5)
    const data = (keyboard.inline_keyboard[1]![0] as any).callback_data
    assert.ok(data.length <= 64)
    assert.deepEqual(NOTIFY_CARD.decode(data.match(NOTIFY_CARD.pattern)!), {deliveryId: 42, mediaType: 'tv', mediaId: 2, contentType: 'series'})
    assert.deepEqual(NOTIFY_BACK.decode(NOTIFY_BACK.encode({deliveryId: 42}).match(NOTIFY_BACK.pattern)!), {deliveryId: 42})
    assert.equal(contentTypeOf('movie', [16, 35]), 'cartoon')

    assert.equal(buildDigest({events: [], titles, calendar: [], today: '2026-11-21'}), undefined)
})

test('сводка: больше 10 в разделе — «и ещё N»; больше 3 тайтлов — кнопка «Ещё»', () => {
    const titles = new Map(Array.from({length: 12}, (_, index) => [`movie:${index + 1}`, {title: `Фильм ${index + 1}`, genres: []}]))
    const payload = buildDigest({
        today: '2026-11-21', titles, calendar: [],
        events: Array.from({length: 12}, (_, index) => event(index + 1, {tmdb_id: index + 1}))
    })!
    assert.match(payload.html, /и ещё 2 — в коллекции/)
    assert.equal((payload.html.match(/премьера сегодня/g) ?? []).length, 10)

    const texts = (keyboard: any) => keyboard.inline_keyboard.map((row: any) => row[0].text)
    assert.deepEqual(texts(digestKeyboard(payload.cards, 7)), ['🎬 Фильм 1', '🎬 Фильм 2', '🎬 Фильм 3', '▼ Ещё · 9', '📦 Коллекция'])
    const open = digestKeyboard(payload.cards, 7, true)
    assert.equal(open.inline_keyboard.length, 14)
    assert.deepEqual(texts(open).slice(-2), ['▲ Свернуть', '📦 Коллекция'])
    const more = (digestKeyboard(payload.cards, 7).inline_keyboard[3]![0] as any).callback_data
    assert.deepEqual(NOTIFY_MORE.decode(more.match(NOTIFY_MORE.pattern)!), {deliveryId: 7, open: true})
})

test('таймер сводки открыт снаружи (своя проверка CRON_SECRET), соседние служебные — нет', async () => {
    const {isInternalOnlyPath} = await import('../../../../utils/api/internalPaths')
    assert.equal(isInternalOnlyPath('/api/bot/notifications/tick'), false)
    assert.equal(isInternalOnlyPath('/api/bot/notifications/tick?mode=detect'), false)
    assert.equal(isInternalOnlyPath('/api/bot/notifications/other'), true)
})

test('сводка по умолчанию только администратору; всем — только с NOTIFICATIONS_DIGEST=all', async () => {
    const {digestMode} = await import('../digest')
    assert.equal(digestMode({} as NodeJS.ProcessEnv), 'admin')
    assert.equal(digestMode({NOTIFICATIONS_DIGEST: 'что-то'} as NodeJS.ProcessEnv), 'admin')
    assert.equal(digestMode({NOTIFICATIONS_DIGEST: 'all', NODE_ENV: 'development'} as NodeJS.ProcessEnv), 'admin')
    assert.equal(digestMode({NOTIFICATIONS_DIGEST: 'all'} as NodeJS.ProcessEnv), 'all')
    assert.equal(digestMode({NOTIFICATIONS_DIGEST: 'off'} as NodeJS.ProcessEnv), 'off')
})
