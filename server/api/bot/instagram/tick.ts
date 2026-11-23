import {timingSafeEqual} from 'node:crypto'
import {bot} from '#server/bot/bot'
import {getSupabase} from '#server/global/engine/instagram/reel/jobs/dispatchReelJob'
import {runInstagramTick} from '#server/global/engine/instagram/comments/tick'

/**
 * Таймер Instagram «СОХРАНИТЬ» (server/global/engine/instagram/comments/). Google Cloud Scheduler
 * каждые 5 минут, GET или POST с `Authorization: Bearer <CRON_SECRET>`. Проход ограничен по времени;
 * что не успели — подберёт следующий таймер.
 */
const TICK_BUDGET_MS = 120_000

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
    const result = await runInstagramTick(getSupabase(), bot.telegram, new Date(), {deadline: Date.now() + TICK_BUDGET_MS})
    console.log('[IG TICK]', JSON.stringify(result))
    return result
})
