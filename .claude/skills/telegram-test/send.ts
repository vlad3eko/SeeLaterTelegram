/**
 * Тестовое сообщение администратору (ADMIN_TELEGRAM_ID) от боевого бота — как его увидят пользователи.
 * Скилл telegram-test. Запуск из корня checkout:
 *
 *   npx tsx --env-file=<путь к .env> --tsconfig tsconfig.reel-dryrun.json .claude/skills/telegram-test/send.ts <режим> [...]
 *
 * Режимы:
 *   card <movie|tv> <tmdbId> [contentType]   карточка фильма или сериала (contentType: movie, series, cartoon, cartoonSeries…)
 *   status                                    панель /status
 *   digest                                    сводка уведомлений на демо-событиях по сохранённым администратора
 *   rich <файл.json>                          любое Rich-сообщение: {"blocks": [...]} (или {"rich": {...}, "keyboard": {...}})
 *
 * Шлёт только администратору. Токены и ключи не выводит — только итог «telegram 200 true» или описание ошибки.
 * Сводка пишет демо-payload в тестовую строку digest_deliveries за 2000-01-01, чтобы работали кнопки сводки.
 */
import {readFileSync} from 'node:fs'
import {ofetch} from 'ofetch'

// Карточки ходят за TMDB через свои роуты /api/tmdb/* ($fetch Nitro): вне Nitro — в прод.
;(globalThis as any).$fetch ??= ofetch.create({baseURL: 'https://kinomanov.net'})

const [mode, ...args] = process.argv.slice(2)
const {ADMIN_TELEGRAM_ID} = await import('#server/global/oneLinkApp')

const api = async (method: string, body: Record<string, unknown>) => {
    const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/${method}`, {
        method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(body)
    })
    return await response.json() as {ok: boolean, description?: string, result?: any}
}

const sendRich = async (label: string, rich: any, keyboard?: any) => {
    const result = await api('sendRichMessage', {chat_id: ADMIN_TELEGRAM_ID, rich_message: rich, ...(keyboard ? {reply_markup: keyboard} : {})})
    console.log(`[TEST] ${label}: telegram ${result.ok}${result.description ? ` — ${result.description}` : ''}`)
    if (!result.ok) process.exitCode = 1
}

const testCard = async () => {
    const [type, id, contentType] = args
    if ((type !== 'movie' && type !== 'tv') || !Number(id)) throw new Error('card <movie|tv> <tmdbId> [contentType]')
    const {bot} = await import('#server/bot/bot')
    const {constructRichCard} = await import('#server/global/engine/card/construct/constructRichCard')
    const target: any = {ctx: {telegram: bot.telegram, from: {id: ADMIN_TELEGRAM_ID}, chat: {id: ADMIN_TELEGRAM_ID}}, isAdmin: true}
    const {caption, keyboard} = await constructRichCard(target, {
        id: Number(id), type, status: 'ready', contentType: (contentType ?? (type === 'tv' ? 'series' : 'movie')) as any
    } as any)
    await sendRich(`card ${type} ${id}`, caption, keyboard)
}

const testStatus = async () => {
    const {buildAdminStatus} = await import('#server/bot/actions/admin/status/adminStatus')
    const {rich, keyboard} = await buildAdminStatus()
    rich.blocks[0].text[0] = `🧪 Тест · ${rich.blocks[0].text[0]}`
    await sendRich('status', rich, keyboard)
}

const testDigest = async () => {
    const {createClient} = await import('@supabase/supabase-js')
    const {buildDigest, digestKeyboard, upcoming, mediaKey} = await import('#server/global/engine/notifications/digest')
    const {coverBlock} = await import('#server/bot/actions/collections/wizardCovers')
    const {moscowDate} = await import('#server/global/engine/notifications/snapshot')
    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {auth: {persistSession: false}})
    const today = moscowDate(new Date())

    const {data: user} = await supabase.from('users').select('id').eq('telegram_id', ADMIN_TELEGRAM_ID).single()
    const {data: favorites} = await supabase.from('favorites')
        .select('user_id,media_type,tmdb_id,title,genres_ids,poster_path,created_at').eq('user_id', user!.id)
    const {data: watch} = await supabase.from('media_watch').select('*').not('checked_at', 'is', null)
    const {data: coverRow} = await supabase.from('collection_covers').select('file_id').eq('bot', 'prod').eq('screen', 'digest').limit(1).maybeSingle()

    const mine = new Set((favorites ?? []).map(row => mediaKey(row.media_type, row.tmdb_id)))
    const rows = (watch ?? []).filter(row => mine.has(mediaKey(row.media_type, row.tmdb_id)))
    const titles = new Map((favorites ?? []).map(row => [mediaKey(row.media_type, row.tmdb_id), {title: row.title ?? '', genres: row.genres_ids, poster: row.poster_path}]))

    // Демо-события из того, что есть в базе: премьера, серии, перенос, трейлеры, постеры.
    let id = 1
    const event = (row: any, event_type: string, payload: any, event_date: string | null = today) =>
        ({id: id++, media_type: row.media_type, tmdb_id: row.tmdb_id, event_type, event_key: `demo${id}`, event_date, payload, source: 'demo', detected_at: new Date().toISOString()})
    const released = rows.filter(row => row.media_type === 'movie' && row.release_date && row.release_date <= today)
    const future = rows.filter(row => row.media_type === 'movie' && row.release_date && row.release_date > today)
    const series = rows.filter(row => row.media_type === 'tv')
    const events = [
        ...released.slice(0, 2).map(row => event(row, 'movie_premiere', {date: today})),
        ...series.slice(0, 1).map(row => event(row, 'tv_episodes', {season: 2, from: 5, to: 7, count: 3})),
        ...series.slice(1, 2).map(row => event(row, 'tv_episodes', {season: 1, from: 1, to: 8, count: 8, wholeSeason: true, seasonStart: true})),
        ...future.slice(0, 2).map(row => event(row, 'release_date_changed', {from: '2026-12-09', to: row.release_date}, row.release_date)),
        ...rows.filter(row => row.snapshot?.trailers?.length).slice(0, 3).map(row => event(row, 'trailer_added', {key: row.snapshot.trailers[0], russian: true})),
        ...[...rows].reverse().filter(row => (row.snapshot?.posters?.length ?? 0) >= 3).slice(0, 3)
            .map((row, index) => event(row, 'posters_added', {paths: row.snapshot.posters.slice(0, 3 - index), count: 3 - index}))
    ]
    if (!events.length) throw new Error('у администратора нет сохранённых тайтлов под слежкой — не из чего собрать демо')

    const calendar = upcoming(rows.map(row => ({...row, title: titles.get(mediaKey(row.media_type, row.tmdb_id))?.title || row.title})), today)
    const payload: any = buildDigest({events, titles, calendar, today, cover: coverRow?.file_id ? coverBlock(coverRow.file_id) : undefined})
    const heading = payload.rich.blocks.find((block: any) => block.type === 'heading' && block.size === 1)
    heading.text = [`🧪 Тест · ${heading.text[0]}`]
    payload.test = true

    const {data: delivery} = await supabase.from('digest_deliveries').upsert(
        {user_id: user!.id, digest_date: '2000-01-01', cutoff: '2000-01-01T00:00:00Z', event_ids: [], payload, status: 'sent'},
        {onConflict: 'user_id,digest_date'}
    ).select('id').single()
    await sendRich(`digest (${payload.count} новостей)`, payload.rich, digestKeyboard(payload.cards, Number(delivery!.id)))
}

const testRich = async () => {
    const [file] = args
    if (!file) throw new Error('rich <файл.json>')
    const data = JSON.parse(readFileSync(file, 'utf8'))
    await sendRich(`rich ${file}`, data.rich ?? data, data.keyboard)
}

const modes: Record<string, () => Promise<void>> = {card: testCard, status: testStatus, digest: testDigest, rich: testRich}
if (!mode || !modes[mode]) {
    console.error('Режим: card <movie|tv> <id> [contentType] | status | digest | rich <file.json>')
    process.exit(2)
}
if (!process.env.TELEGRAM_TOKEN) {
    console.error('Нет TELEGRAM_TOKEN: передайте --env-file с путём к .env')
    process.exit(2)
}
try {
    await modes[mode]!()
} catch (error: any) {
    console.error('[TEST] ошибка:', error?.response?.description ?? error?.message ?? error)
    process.exitCode = 1
}
process.exit()
