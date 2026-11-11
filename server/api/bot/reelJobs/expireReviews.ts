import {timingSafeEqual} from 'node:crypto'
import {
    expireReelReview,
    listExpiredReelReviews
} from '#server/global/engine/instagram/reel/jobs/reelReview'
import {
    deleteReelReviewMessage,
    sendReelReviewStatus
} from '#server/bot/actions/admin/reelReview/reelReviewMessages'
import {deleteReelTempFiles, sweepReelTempFolders} from '#server/global/engine/instagram/reel/jobs/reelStorageCleanup'
import {deleteOldMessagesSession} from '#server/bot/services/session/deleteOldMessagesSession'

/**
 * Таймер ручной проверки Reel: задачи, где администратор не нажал ничего за 24 часа,
 * отменяются целиком (решение владельца 12.11): ничего не публикуется. Вызывать раз в час
 * GET или POST с заголовком `Authorization: Bearer <CRON_SECRET>` (так его шлёт
 * Vercel Cron; Google Cloud Scheduler настраивается с тем же заголовком).
 */

const isAuthorized = (header: string | undefined): boolean => {
    const secret = process.env.CRON_SECRET?.trim()

    // Без секрета эндпоинт закрыт: иначе любой мог бы досрочно запускать публикации.
    if (!secret || !header) return false

    const received = Buffer.from(header)
    const expected = Buffer.from(`Bearer ${secret}`)

    return received.length === expected.length && timingSafeEqual(received, expected)
}

export default defineEventHandler(async (event) => {
    const method = event.method
    if (method !== 'GET' && method !== 'POST') {
        throw createError({statusCode: 405, message: 'Method not allowed'})
    }

    if (!isAuthorized(getHeader(event, 'authorization'))) {
        throw createError({statusCode: 401, message: 'Unauthorized'})
    }

    const expiredIds = await listExpiredReelReviews(20)
    const expired: string[] = []
    const failed: Array<{jobId: string, error: string}> = []

    for (const jobId of expiredIds) {
        try {
            const job = await expireReelReview(jobId)

            // Нажатие успело раньше таймера: задача уже не на проверке.
            if (!job) continue

            expired.push(jobId)

            await deleteReelReviewMessage(job)
            await deleteReelTempFiles({mediaId: job.media_id, mediaType: job.media_type, keyTrailer: job.key_trailer})
            try {
                await deleteOldMessagesSession(Number(job.admin_telegram_id))
            } catch (cleanupError) {
                console.error('[REEL REVIEW EXPIRY CHAT CLEANUP ERROR]', cleanupError)
            }
            await sendReelReviewStatus(
                job,
                '⏰ Время выбора истекло (24 часа): публикация отменена, ничего не опубликовано. ' +
                'Чтобы начать заново, нажми «Опубликовать» на карточке.'
            )
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            console.error('[REEL REVIEW EXPIRY ERROR]', {jobId, error: message})
            failed.push({jobId, error: message})
        }
    }

    console.log('[REEL REVIEW EXPIRY]', {found: expiredIds.length, expired, failed: failed.length})

    // Тот же часовой вызов чистит temp/ и preview/ от файлов завершённых задач.
    let sweep: Awaited<ReturnType<typeof sweepReelTempFolders>> | {error: string}
    try {
        sweep = await sweepReelTempFolders()
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.error('[REEL TEMP SWEEP ERROR]', message)
        sweep = {error: message}
    }

    return {success: true, found: expiredIds.length, expired, failed, sweep}
})
