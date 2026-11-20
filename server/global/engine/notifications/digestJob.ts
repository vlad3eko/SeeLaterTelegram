import type {SupabaseClient} from '@supabase/supabase-js'
import {bot} from '#server/bot/bot'
import {BOT_ADMINS} from '#server/global/oneLinkApp'
import {
    buildDigest,
    digestKeyboard,
    eventsForUser,
    mediaKey,
    upcoming,
    type DigestPayload,
    type EventRow,
    type Subscription,
    type WatchRow
} from '#server/global/engine/notifications/digest'
import {moscowDate, moscowMinutes} from '#server/global/engine/notifications/snapshot'

/**
 * Сводка (этап digest): раз в день, с 10:00 по Москве, одно сообщение на пользователя.
 *
 * prepare — от событий к подписчикам: новые события одним запросом → подписчики этих тайтлов
 * одним запросом (favorites) → в памяти каждому его события. TMDB здесь не нужен.
 * send — готовые сводки пачкой; повтор таймера не шлёт дважды (unique user_id + digest_date,
 * статус sending ставится до отправки; неясный исход — unknown, без повтора).
 *
 * NOTIFICATIONS_DIGEST: off — не слать; admin (по умолчанию, обкатка) — только администратору;
 * all — всем. В npm run dev — всегда только администратору.
 */

type Supabase = SupabaseClient<any, any, any>

const DIGEST_START = 10 * 60
const PREPARE_END = 12 * 60
const SEND_END = 14 * 60
const EVENT_LOOKBACK_MS = 14 * 24 * 60 * 60_000
const SEND_BATCH = 200
const SEND_PAUSE_MS = 40
const SEND_BUDGET_MS = 200_000
const MAX_ATTEMPTS = 3
const CHUNK = 200

export type DigestMode = 'off' | 'admin' | 'all'

export const digestMode = (env: NodeJS.ProcessEnv = process.env): DigestMode => {
    if (env.NODE_ENV === 'development') return 'admin'
    const value = env.NOTIFICATIONS_DIGEST?.trim().toLowerCase()
    return value === 'off' || value === 'all' ? value : 'admin'
}

const chunks = <T>(items: T[], size = CHUNK) =>
    Array.from({length: Math.ceil(items.length / size)}, (_, index) => items.slice(index * size, index * size + size))

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export type PrepareReport = {events: number, recipients: number, created: number, skipped?: string}

export const prepareDigests = async (supabase: Supabase, now = new Date(), {force = false} = {}): Promise<PrepareReport> => {
    const report: PrepareReport = {events: 0, recipients: 0, created: 0}
    const mode = digestMode()
    if (mode === 'off') return {...report, skipped: 'NOTIFICATIONS_DIGEST=off'}
    const minutes = moscowMinutes(now)
    if (!force && (minutes < DIGEST_START || minutes >= PREPARE_END)) return {...report, skipped: 'не время сводки (10:00–12:00 МСК)'}

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
            .select('user_id,media_type,tmdb_id,title,genres_ids,created_at').in('tmdb_id', part)
        if (error) throw error
        subscribers.push(...((data ?? []) as Subscription[]).filter(row => eventKeys.has(mediaKey(row.media_type, row.tmdb_id))))
    }
    const userIds = [...new Set(subscribers.map(row => row.user_id))]
    if (!userIds.length) return report

    const users = new Map<number, {telegram_id: number}>()
    for (const part of chunks(userIds)) {
        const {data, error} = await supabase.from('users')
            .select('id,telegram_id,digest_enabled,bot_blocked_at').in('id', part)
        if (error) throw error
        for (const user of data ?? []) {
            if (user.digest_enabled === false || user.bot_blocked_at || !user.telegram_id) continue
            if (mode === 'admin' && !BOT_ADMINS.includes(Number(user.telegram_id))) continue
            users.set(Number(user.id), {telegram_id: Number(user.telegram_id)})
        }
    }
    if (!users.size) return report

    // Прошлая сводка каждого (cutoff) и сегодняшняя, если уже есть.
    const lastCutoff = new Map<number, string>()
    const doneToday = new Set<number>()
    for (const part of chunks([...users.keys()])) {
        const {data, error} = await supabase.from('digest_deliveries')
            .select('user_id,digest_date,cutoff').in('user_id', part).order('cutoff', {ascending: false})
        if (error) throw error
        for (const row of data ?? []) {
            if (!lastCutoff.has(row.user_id)) lastCutoff.set(row.user_id, row.cutoff)
            if (row.digest_date === today) doneToday.add(row.user_id)
        }
    }
    const recipients = [...users.keys()].filter(id => !doneToday.has(id))
    if (!recipients.length) return report

    // Календарь: все сохранённые получателей и их ближайшие даты (одна таблица, одним проходом).
    const allSubscriptions: Subscription[] = []
    for (const part of chunks(recipients)) {
        const {data, error} = await supabase.from('favorites')
            .select('user_id,media_type,tmdb_id,title,genres_ids,created_at').in('user_id', part)
        if (error) throw error
        allSubscriptions.push(...((data ?? []) as Subscription[]))
    }
    const {data: futureRows, error: futureError} = await supabase.from('media_watch')
        .select('media_type,tmdb_id,title,release_date,next_episode_air_date,next_episode')
        .or(`release_date.gt.${today},next_episode_air_date.gt.${today}`)
        .limit(5000)
    if (futureError) throw futureError
    const future = new Map(((futureRows ?? []) as WatchRow[]).map(row => [mediaKey(row.media_type, row.tmdb_id), row]))

    const rows: any[] = []
    for (const userId of recipients) {
        const mine = allSubscriptions.filter(row => row.user_id === userId)
        const userEvents = eventsForUser(events, mine, lastCutoff.get(userId) ?? null)
        if (!userEvents.length) continue
        const titles = new Map(mine.map(row => [mediaKey(row.media_type, row.tmdb_id), {title: row.title ?? '', genres: row.genres_ids}]))
        const calendar = upcoming(mine
            .map(row => future.get(mediaKey(row.media_type, row.tmdb_id)))
            .filter((row): row is WatchRow => Boolean(row))
            .map(row => ({...row, title: titles.get(mediaKey(row.media_type, row.tmdb_id))?.title || row.title})), today)
        const payload = buildDigest({events: userEvents, titles, calendar, today})
        if (!payload) continue
        rows.push({user_id: userId, digest_date: today, event_ids: userEvents.map(event => event.id), cutoff: nowIso, payload})
    }
    report.recipients = rows.length
    if (!rows.length) return report

    const {data: inserted, error: insertError} = await supabase.from('digest_deliveries')
        .upsert(rows, {onConflict: 'user_id,digest_date', ignoreDuplicates: true}).select('id')
    if (insertError) throw insertError
    report.created = inserted?.length ?? 0
    return report
}

const errorCode = (error: any): number | undefined => Number(error?.response?.error_code ?? error?.code) || undefined

const callApi = (method: string, payload: Record<string, unknown>) =>
    (bot.telegram.callApi as unknown as (method: string, payload: Record<string, unknown>) => Promise<any>)
        .call(bot.telegram, method, payload)

/** Rich Message; Telegram не принял разметку (400) — тот же текст обычным HTML без фото. */
const sendDigest = async (chatId: number, payload: DigestPayload) => {
    const reply_markup = digestKeyboard(payload.cards)
    try {
        return await callApi('sendRichMessage', {chat_id: chatId, rich_message: payload.rich, reply_markup})
    } catch (error: any) {
        if (errorCode(error) !== 400) throw error
        console.warn('[NOTIFY] rich digest rejected, fallback to HTML', error?.message)
        return await callApi('sendMessage', {chat_id: chatId, text: payload.html, parse_mode: 'HTML', reply_markup, link_preview_options: {is_disabled: true}})
    }
}

export type SendReport = {sent: number, failed: number, blocked: number, unknown: number, skipped?: string}

export const sendDigests = async (supabase: Supabase, now = new Date(), {force = false} = {}): Promise<SendReport> => {
    const report: SendReport = {sent: 0, failed: 0, blocked: 0, unknown: 0}
    const minutes = moscowMinutes(now)
    if (!force && (minutes < DIGEST_START || minutes >= SEND_END)) return {...report, skipped: 'не время отправки'}
    const started = Date.now()

    const {data, error} = await supabase.from('digest_deliveries')
        .select('id,user_id,payload,status,attempts')
        .eq('digest_date', moscowDate(now))
        .in('status', ['pending', 'failed'])
        .lt('attempts', MAX_ATTEMPTS)
        .order('id')
        .limit(SEND_BATCH)
    if (error) throw error
    if (!data?.length) return report

    const {data: users, error: usersError} = await supabase.from('users')
        .select('id,telegram_id').in('id', [...new Set(data.map(row => row.user_id))])
    if (usersError) throw usersError
    const telegramIds = new Map((users ?? []).map(user => [Number(user.id), Number(user.telegram_id)]))

    for (const delivery of data) {
        if (Date.now() - started > SEND_BUDGET_MS) break
        const chatId = telegramIds.get(Number(delivery.user_id))
        if (!chatId) continue

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
                message = await sendDigest(chatId, delivery.payload as DigestPayload)
            } catch (error: any) {
                const retryAfter = Number(error?.response?.parameters?.retry_after)
                if (errorCode(error) !== 429 || !(retryAfter <= 30)) throw error
                await sleep(retryAfter * 1000)
                message = await sendDigest(chatId, delivery.payload as DigestPayload)
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
    return report
}
