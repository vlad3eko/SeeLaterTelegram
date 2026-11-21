import {timingSafeEqual} from 'node:crypto'
import type {H3Event} from 'h3'
import {getSupabase} from '#server/global/engine/instagram/reel/jobs/dispatchReelJob'
import {detectUpdates} from '#server/global/engine/notifications/detect'
import {prepareDigests, sendDigests} from '#server/global/engine/notifications/digestJob'

/**
 * Таймер сводки обновлений по сохранённым (server/global/engine/notifications/).
 * Google Cloud Scheduler каждые 30 минут (0,30 * * * *, Europe/Moscow), GET или POST
 * с `Authorization: Bearer <CRON_SECRET>`.
 *
 *   ?mode=auto (по умолчанию) — detect каждый раз; с 09:00 по Москве очередь сводок готовится
 *     заранее, с 10:00 рассылается — готовое первым, ещё до detect, чтобы уйти без задержки.
 *
 * У запуска общий лимит времени (TICK_BUDGET_MS, у Vercel — 300 с). Не успели подготовить или
 * разослать очередь — запуск сам вызывает себя заново (mode=digest&hop=N) и продолжает ту же
 * очередь, не дожидаясь следующего таймера (решение владельца 21.11). hop — защита от петли.
 *   ?mode=detect | ?mode=digest — только один этап
 *   &force=1 — сводка вне окна 10:00–12:00 (ручная проверка)
 */

const TICK_BUDGET_MS = 230_000
const MAX_HOPS = 12

/**
 * Продолжение в новом вызове (свои 300 с): ответа не ждём — достаточно, чтобы запрос дошёл.
 * Не дошло — очередь подхватит следующий таймер (каждые 30 минут), ничего не теряется.
 */
const continueTick = async (event: H3Event, hop: number, force: boolean) => {
    const url = new URL(getRequestURL(event))
    url.search = new URLSearchParams({mode: 'digest', hop: String(hop), ...(force ? {force: '1'} : {})}).toString()
    await fetch(url, {headers: {authorization: getHeader(event, 'authorization') ?? ''}, signal: AbortSignal.timeout(5_000)})
        .catch(() => undefined)
    return hop
}

const isAuthorized = (header: string | undefined): boolean => {
    const secret = process.env.CRON_SECRET?.trim()
    if (!secret || !header) return false
    const received = Buffer.from(header)
    const expected = Buffer.from(`Bearer ${secret}`)
    return received.length === expected.length && timingSafeEqual(received, expected)
}

export default defineEventHandler(async (event) => {
    if (!isAuthorized(getHeader(event, 'authorization'))) {
        throw createError({statusCode: 401, statusMessage: 'Unauthorized'})
    }

    const query = getQuery(event)
    const mode = String(query.mode ?? 'auto')
    const force = query.force === '1' || query.force === 'true'
    const hop = Math.max(0, Number(query.hop) || 0)
    const supabase = getSupabase()
    const now = new Date()
    const deadline = Date.now() + TICK_BUDGET_MS
    const result: Record<string, any> = {}

    const digest = mode === 'auto' || mode === 'digest'
    // Готовая очередь уходит сразу, не дожидаясь проверки тайтлов (до 2 минут).
    if (digest) result.sendPrepared = await sendDigests(supabase, now, {force, deadline})
    if ((mode === 'auto' || mode === 'detect') && Date.now() < deadline) result.detect = await detectUpdates(supabase, now, {deadline})
    if (digest && !result.detect?.skipped && Date.now() < deadline) {
        result.prepare = await prepareDigests(supabase, now, {force, deadline})
        result.send = await sendDigests(supabase, now, {force, deadline})
    }

    // Очередь не готова или не разослана, а время вышло — продолжаем сразу, новым вызовом.
    const unfinished = Boolean(result.prepare?.unfinished)
        || (result.send ?? result.sendPrepared)?.remaining > 0
        || (digest && !result.prepare && Date.now() >= deadline)
    if (digest && unfinished && hop < MAX_HOPS) result.continued = await continueTick(event, hop + 1, force)

    console.log('[NOTIFY] tick', JSON.stringify(result))
    return result
})
