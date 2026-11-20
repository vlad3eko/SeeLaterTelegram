import {timingSafeEqual} from 'node:crypto'
import {getSupabase} from '#server/global/engine/instagram/reel/jobs/dispatchReelJob'
import {detectUpdates} from '#server/global/engine/notifications/detect'
import {prepareDigests, sendDigests} from '#server/global/engine/notifications/digestJob'

/**
 * Таймер сводки обновлений по сохранённым (server/global/engine/notifications/).
 * Google Cloud Scheduler каждые 30 минут (0,30 * * * *, Europe/Moscow), GET или POST
 * с `Authorization: Bearer <CRON_SECRET>`.
 *
 *   ?mode=auto (по умолчанию) — detect каждый раз; с 10:00 по Москве — подготовка и отправка сводок
 *   ?mode=detect | ?mode=digest — только один этап
 *   &force=1 — сводка вне окна 10:00–12:00 (ручная проверка)
 */

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
    const supabase = getSupabase()
    const now = new Date()
    const result: Record<string, unknown> = {}

    if (mode === 'auto' || mode === 'detect') result.detect = await detectUpdates(supabase, now)
    if ((mode === 'auto' || mode === 'digest') && !(result.detect as any)?.skipped) {
        result.prepare = await prepareDigests(supabase, now, {force})
        result.send = await sendDigests(supabase, now, {force})
    }

    console.log('[NOTIFY] tick', JSON.stringify(result))
    return result
})
