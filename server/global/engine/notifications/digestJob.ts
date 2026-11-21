import type {SupabaseClient} from '@supabase/supabase-js'
import {bot} from '#server/bot/bot'
import {coverBlock, coverFor, forgetCovers} from '#server/bot/actions/collections/wizardCovers'
import {mapLimit} from '#server/global/engine/collections/tmdb'
import {getTelegramMediaCache, setTelegramMediaCache} from '#server/global/engine/card/construct/getTelegramMediaCache'
import {BOT_ADMINS} from '#server/global/oneLinkApp'
import {
    buildDigest,
    digestMode,
    digestKeyboard,
    eventsForUser,
    mediaKey,
    posterUrl,
    upcoming,
    type DigestPayload,
    type EventRow,
    type Subscription,
    type WatchRow
} from '#server/global/engine/notifications/digest'
import {moscowDate, moscowMinutes} from '#server/global/engine/notifications/snapshot'

/**
 * Сводка (этап digest): раз в день одно сообщение на пользователя.
 *
 * Очередь — digest_deliveries (решение владельца 21.11): готовится заранее, с 09:00 по Москве,
 * частями — каждая часть сразу записывается, повторный запуск дополняет ту же очередь (unique
 * user_id + digest_date, готовые пропускаются). В 10:00 очередь рассылается целиком; не уложились
 * во время одного запуска — запуск сам перезапускается и продолжает (server/api/bot/notifications/tick.ts).
 *
 * prepare — от событий к подписчикам: новые события одним запросом → подписчики этих тайтлов
 * одним запросом (favorites) → в памяти каждому его события. TMDB здесь не нужен. Новые постеры
 * загружаются в канал-хранилище один раз на всех (telegram_media_cache), в сводках — их file_id.
 * send — повтор не шлёт дважды: статус sending ставится до отправки; неясный исход — unknown, без повтора.
 *
 * NOTIFICATIONS_DIGEST (digestMode): all — всем (по умолчанию с 22.11, решение владельца), admin —
 * только BOT_ADMINS (так шла обкатка), off — не слать. В npm run dev — всегда только администратору.
 */

type Supabase = SupabaseClient<any, any, any>

/** Очередь готовится с 09:00: до отправки в 10:00 у подготовки два запуска таймера. */
const PREPARE_START = 9 * 60
const DIGEST_START = 10 * 60
const PREPARE_END = 12 * 60
const SEND_END = 14 * 60
const EVENT_LOOKBACK_MS = 14 * 24 * 60 * 60_000
const FIRST_DIGEST_MS = 24 * 60 * 60_000
const SEND_BATCH = 100
const SEND_PAUSE_MS = 40
const DEFAULT_BUDGET_MS = 200_000
const MAX_ATTEMPTS = 3
const CHUNK = 200
/** Сколько получателей записывается в очередь за раз: оборвётся запуск — готовое уже в базе. */
const PREPARE_PART = 100
const UPLOAD_PARALLEL = 3

const chunks = <T>(items: T[], size = CHUNK) =>
    Array.from({length: Math.ceil(items.length / size)}, (_, index) => items.slice(index * size, index * size + size))

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

const timeLeft = (deadline: number) => Date.now() < deadline

/**
 * Постер в канал-хранилище один раз на всех: file_id из кэша или загрузка (Telegram сам скачивает
 * картинку TMDB). Дальше все сводки ссылаются на file_id — 50 получателей не значит 50 скачиваний.
 * Не загрузился — в сводке останется ссылка TMDB.
 */
export const uploadPosters = async (paths: string[], deadline: number): Promise<Map<string, string>> => {
    const files = new Map<string, string>()
    const storage = process.env.TELEGRAM_MEDIA_STORAGE_CHAT_ID
    if (!storage || !paths.length) return files
    await mapLimit(paths, UPLOAD_PARALLEL, async path => {
        const key = `digest_poster_${path}`
        try {
            const cached = await getTelegramMediaCache(key)
            if (cached) return void files.set(path, cached)
            if (!timeLeft(deadline)) return
            const message = await bot.telegram.sendPhoto(storage, posterUrl(path), {disable_notification: true})
            const fileId = message?.photo?.at(-1)?.file_id
            if (!fileId) return
            files.set(path, fileId)
            await setTelegramMediaCache(key, fileId)
        } catch (error: any) {
            console.warn('[NOTIFY] poster upload failed', path, error?.response?.description ?? error?.message)
        }
    })
    return files
}

export type PrepareReport = {events: number, recipients: number, created: number, posters?: number, unfinished?: boolean, skipped?: string}

export const prepareDigests = async (
    supabase: Supabase,
    now = new Date(),
    {force = false, deadline = Date.now() + DEFAULT_BUDGET_MS} = {}
): Promise<PrepareReport> => {
    const report: PrepareReport = {events: 0, recipients: 0, created: 0}
    const mode = digestMode()
    if (mode === 'off') return {...report, skipped: 'NOTIFICATIONS_DIGEST=off'}
    const minutes = moscowMinutes(now)
    if (!force && (minutes < PREPARE_START || minutes >= PREPARE_END)) return {...report, skipped: 'не время сводки (09:00–12:00 МСК)'}

    const today = moscowDate(now)
    const nowIso = now.toISOString()

    // 1. Новые события — один запрос. Нет событий — никого не трогаем.
    const {data: eventRows, error: eventsError} = await supabase.from('media_events')
        .select('id,media_type,tmdb_id,event_type,event_key,event_date,payload,source,detected_at')
        .gt('detected_at', new Date(now.getTime() - EVENT_LOOKBACK_MS).toISOString())
        .lte('detected_at', nowIso)
        .order('id')
        .limit(5000)
    if (eventsError) throw eventsError
    const events = (eventRows ?? []) as EventRow[]
    report.events = events.length
    if (!events.length) return report

    // 2. Подписчики этих тайтлов — по списку тайтлов, а не по каждому пользователю.
    const eventKeys = new Set(events.map(event => mediaKey(event.media_type, event.tmdb_id)))
    const ids = [...new Set(events.map(event => event.tmdb_id))]
    const subscribers: Subscription[] = []
    for (const part of chunks(ids)) {
        const {data, error} = await supabase.from('favorites')
            .select('user_id,media_type,tmdb_id').in('tmdb_id', part)
        if (error) throw error
        subscribers.push(...((data ?? []) as Subscription[]).filter(row => eventKeys.has(mediaKey(row.media_type, row.tmdb_id))))
    }
    const userIds = [...new Set(subscribers.map(row => row.user_id))]
    if (!userIds.length) return report

    const users = new Set<number>()
    for (const part of chunks(userIds)) {
        const {data, error} = await supabase.from('users')
            .select('id,telegram_id,digest_enabled,bot_blocked_at').in('id', part)
        if (error) throw error
        for (const user of data ?? []) {
            if (user.digest_enabled === false || user.bot_blocked_at || !user.telegram_id) continue
            if (mode === 'admin' && !BOT_ADMINS.includes(Number(user.telegram_id))) continue
            users.add(Number(user.id))
        }
    }
    if (!users.size) return report

    // Прошлая сводка каждого (cutoff) и сегодняшняя: кто уже в очереди — пропускаем (дополняем очередь).
    const lastCutoff = new Map<number, string>()
    const doneToday = new Set<number>()
    for (const part of chunks([...users])) {
        const {data, error} = await supabase.from('digest_deliveries')
            .select('user_id,digest_date,cutoff').in('user_id', part).order('cutoff', {ascending: false})
        if (error) throw error
        for (const row of data ?? []) {
            if (!lastCutoff.has(row.user_id)) lastCutoff.set(row.user_id, row.cutoff)
            if (row.digest_date === today) doneToday.add(row.user_id)
        }
    }
    const recipients = [...users].filter(id => !doneToday.has(id))
    if (!recipients.length) return report

    // Календарь: все сохранённые получателей и их ближайшие даты (одна таблица, одним проходом).
    const byUser = new Map<number, Subscription[]>()
    for (const part of chunks(recipients)) {
        const {data, error} = await supabase.from('favorites')
            .select('user_id,media_type,tmdb_id,title,genres_ids,poster_path,created_at').in('user_id', part)
        if (error) throw error
        for (const row of (data ?? []) as Subscription[]) byUser.set(row.user_id, [...(byUser.get(row.user_id) ?? []), row])
    }
    const {data: futureRows, error: futureError} = await supabase.from('media_watch')
        .select('media_type,tmdb_id,title,release_date,next_episode_air_date,next_episode')
        .or(`release_date.gt.${today},next_episode_air_date.gt.${today}`)
        .limit(5000)
    if (futureError) throw futureError
    const future = new Map(((futureRows ?? []) as WatchRow[]).map(row => [mediaKey(row.media_type, row.tmdb_id), row]))

    // Обложка «Ваши новости сегодня» — одна на всех (file_id этого бота); нет в базе — коллаж постеров.
    const coverId = await coverFor('digest')
    const cover = coverId ? coverBlock(coverId) : undefined

    // Новые постеры — один раз на всех, до сборки сводок.
    const posterPaths = [...new Set(events
        .filter(event => event.event_type === 'posters_added')
        .flatMap(event => (event.payload?.paths ?? []) as string[]))]
    const posterFiles = await uploadPosters(posterPaths, deadline)
    report.posters = posterFiles.size

    // Очередь частями: каждая часть сразу в базе; кончилось время — следующий запуск продолжит.
    for (const part of chunks(recipients, PREPARE_PART)) {
        if (!timeLeft(deadline)) {
            report.unfinished = true
            break
        }
        const rows: any[] = []
        for (const userId of part) {
            const mine = byUser.get(userId) ?? []
            // Первая сводка — только за последние сутки: старые события не приходят разом.
            const userEvents = eventsForUser(events, mine, lastCutoff.get(userId) ?? new Date(now.getTime() - FIRST_DIGEST_MS).toISOString())
            if (!userEvents.length) continue
            const titles = new Map(mine.map(row => [mediaKey(row.media_type, row.tmdb_id), {title: row.title ?? '', genres: row.genres_ids, poster: row.poster_path ?? null}]))
            const calendar = upcoming(mine
                .map(row => future.get(mediaKey(row.media_type, row.tmdb_id)))
                .filter((row): row is WatchRow => Boolean(row))
                .map(row => ({...row, title: titles.get(mediaKey(row.media_type, row.tmdb_id))?.title || row.title})), today)
            const payload = buildDigest({events: userEvents, titles, calendar, today, cover, posterFiles})
            if (payload) rows.push({user_id: userId, digest_date: today, event_ids: userEvents.map(event => event.id), cutoff: nowIso, payload})
        }
        report.recipients += rows.length
        if (!rows.length) continue
        const {data: inserted, error: insertError} = await supabase.from('digest_deliveries')
            .upsert(rows, {onConflict: 'user_id,digest_date', ignoreDuplicates: true}).select('id')
        if (insertError) throw insertError
        report.created += inserted?.length ?? 0
    }
    return report
}

const errorCode = (error: any): number | undefined => Number(error?.response?.error_code ?? error?.code) || undefined

const callApi = (method: string, payload: Record<string, unknown>) =>
    (bot.telegram.callApi as unknown as (method: string, payload: Record<string, unknown>) => Promise<any>)
        .call(bot.telegram, method, payload)

/** Rich Message; Telegram не принял разметку (400) — тот же текст обычным HTML без фото. */
const sendDigest = async (chatId: number, payload: DigestPayload, deliveryId: number) => {
    const reply_markup = digestKeyboard(payload.cards, deliveryId)
    try {
        return await callApi('sendRichMessage', {chat_id: chatId, rich_message: payload.rich, reply_markup})
    } catch (error: any) {
        if (errorCode(error) !== 400) throw error
        // Обложку удалили из канала-хранилища — та же сводка без неё.
        const first = payload.rich.blocks?.[0]
        if (first?.type === 'animation' || first?.type === 'photo') {
            forgetCovers()
            try {
                return await callApi('sendRichMessage', {chat_id: chatId, rich_message: {...payload.rich, blocks: payload.rich.blocks.slice(1)}, reply_markup})
            } catch (retryError: any) {
                if (errorCode(retryError) !== 400) throw retryError
            }
        }
        console.warn('[NOTIFY] rich digest rejected, fallback to HTML', error?.message)
        return await callApi('sendMessage', {chat_id: chatId, text: payload.html, parse_mode: 'HTML', reply_markup, link_preview_options: {is_disabled: true}})
    }
}

/** remaining — сводки, которые ещё ждут первой отправки: есть — запуск продолжит без ожидания таймера. */
export type SendReport = {sent: number, failed: number, blocked: number, unknown: number, remaining: number, skipped?: string}

export const sendDigests = async (
    supabase: Supabase,
    now = new Date(),
    {force = false, deadline = Date.now() + DEFAULT_BUDGET_MS} = {}
): Promise<SendReport> => {
    const report: SendReport = {sent: 0, failed: 0, blocked: 0, unknown: 0, remaining: 0}
    const minutes = moscowMinutes(now)
    if (!force && (minutes < DIGEST_START || minutes >= SEND_END)) return {...report, skipped: 'не время отправки'}
    const today = moscowDate(now)

    // Вся очередь пачками по возрастанию id: каждая сводка — один раз за вызов
    // (failed повторяются следующими запусками, до MAX_ATTEMPTS).
    for (let lastId = 0; timeLeft(deadline);) {
        const {data, error} = await supabase.from('digest_deliveries')
            .select('id,user_id,payload,status,attempts')
            .eq('digest_date', today)
            .in('status', ['pending', 'failed'])
            .lt('attempts', MAX_ATTEMPTS)
            .gt('id', lastId)
            .order('id')
            .limit(SEND_BATCH)
        if (error) throw error
        if (!data?.length) break
        lastId = Number(data.at(-1)!.id)

        const {data: users, error: usersError} = await supabase.from('users')
            .select('id,telegram_id').in('id', [...new Set(data.map(row => row.user_id))])
        if (usersError) throw usersError
        const telegramIds = new Map((users ?? []).map(user => [Number(user.id), Number(user.telegram_id)]))

        for (const delivery of data) {
            if (!timeLeft(deadline)) break
            const chatId = telegramIds.get(Number(delivery.user_id))
            if (!chatId) {
                // Без telegram_id отправить нельзя — снимаем с очереди, иначе её брал бы каждый запуск.
                await supabase.from('digest_deliveries').update({status: 'failed', attempts: MAX_ATTEMPTS, last_error: 'нет telegram_id'}).eq('id', delivery.id)
                report.failed++
                continue
            }

            // Захват: статус sending до отправки. Второй вызов эту строку уже не возьмёт.
            const {data: claimed} = await supabase.from('digest_deliveries')
                .update({status: 'sending', attempts: delivery.attempts + 1})
                .eq('id', delivery.id).eq('status', delivery.status).select('id')
            if (!claimed?.length) continue

            const finish = (fields: Record<string, unknown>) =>
                supabase.from('digest_deliveries').update(fields).eq('id', delivery.id)

            try {
                let message: any
                try {
                    message = await sendDigest(chatId, delivery.payload as DigestPayload, Number(delivery.id))
                } catch (error: any) {
                    const retryAfter = Number(error?.response?.parameters?.retry_after)
                    if (errorCode(error) !== 429 || !(retryAfter <= 30)) throw error
                    await sleep(retryAfter * 1000)
                    message = await sendDigest(chatId, delivery.payload as DigestPayload, Number(delivery.id))
                }
                await finish({status: 'sent', sent_at: new Date().toISOString(), telegram_message_id: message?.message_id ?? null, last_error: null})
                report.sent++
            } catch (error: any) {
                const code = errorCode(error)
                const text = String(error?.message ?? error).slice(0, 500)
                if (code === 403) {
                    await finish({status: 'blocked', last_error: text})
                    await supabase.from('users').update({bot_blocked_at: new Date().toISOString()}).eq('id', delivery.user_id)
                    report.blocked++
                } else if (!code || code >= 500) {
                    // Неясно, дошло ли сообщение: не повторяем — лучше пропуск, чем дубль.
                    await finish({status: 'unknown', last_error: text})
                    report.unknown++
                } else {
                    await finish({status: 'failed', last_error: text})
                    report.failed++
                }
                console.warn('[NOTIFY] digest send failed', delivery.id, code, text)
            }
            await sleep(SEND_PAUSE_MS)
        }
    }

    const {count} = await supabase.from('digest_deliveries').select('id', {count: 'exact', head: true})
        .eq('digest_date', today).eq('status', 'pending')
    report.remaining = count ?? 0
    return report
}
