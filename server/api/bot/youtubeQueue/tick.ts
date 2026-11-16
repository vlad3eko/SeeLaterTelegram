import {timingSafeEqual} from 'node:crypto'
import {processYoutubeQueue} from '#server/global/engine/youtube/youtubeQueue'

/**
 * Таймер автопубликации трейлеров с YouTube (server/global/engine/youtube/youtubeQueue.ts).
 * Вызывать каждые 10–15 минут GET или POST с заголовком `Authorization: Bearer <CRON_SECRET>`
 * (Google Cloud Scheduler; у Vercel Cron на Hobby только раз в сутки). Интервал между
 * публикациями задаёт сама очередь (YOUTUBE_QUEUE_INTERVAL_MINUTES), а не частота вызова.
 * В npm run dev тот же тик запускает server/plugins/devYoutubeQueue.ts.
 */

const isAuthorized = (header: string | undefined): boolean => {
    const secret = process.env.CRON_SECRET?.trim()

    // Без секрета эндпоинт закрыт: иначе любой мог бы запускать публикации.
    if (!secret || !header) return false

    const received = Buffer.from(header)
    const expected = Buffer.from(`Bearer ${secret}`)

    return received.length === expected.length && timingSafeEqual(received, expected)
}

export default defineEventHandler(async (event) => {
    if (!isAuthorized(getHeader(event, 'authorization'))) {
        throw createError({statusCode: 401, statusMessage: 'Unauthorized'})
    }

    return await processYoutubeQueue()
})
