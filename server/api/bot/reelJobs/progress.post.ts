import {serverSupabaseServiceRole} from '#supabase/server'
import {finalizerTokenEquals} from '#server/global/engine/instagram/reel/jobs/finalizerToken'
import {editReelReviewProgress} from '#server/bot/actions/admin/reelReview/reelReviewMessages'

/**
 * Ход работы воркера (jobs/reelProgress.ts): готовый текст подставляется в сообщение проверки
 * (`review_message_id`) с кнопкой «Отменить». Токен — тот же, что у финализатора. Отменённую
 * или опубликованную задачу не трогаем: её сообщение уже другое.
 */
export default defineEventHandler(async (event) => {
    const body = await readBody(event)
    const jobId = String(body?.jobId ?? '').trim()
    const text = typeof body?.text === 'string' ? body.text.trim().slice(0, 2000) : ''

    if (!/^[0-9a-f-]{36}$/i.test(jobId) || !text) {
        throw createError({statusCode: 400, message: 'jobId or text is invalid'})
    }

    const supabase = serverSupabaseServiceRole(event) as any
    const {data: job, error} = await supabase
        .from('reel_processing_jobs')
        .select('id,input_payload,status,step,admin_telegram_id,review_message_id')
        .eq('id', jobId)
        .maybeSingle()

    if (error) throw createError({statusCode: 500, message: `Job lookup failed: ${error.message}`})
    if (!job) throw createError({statusCode: 404, message: 'Reel job not found'})
    if (!finalizerTokenEquals(body?.callbackToken, job.input_payload?.finalizerToken)) {
        throw createError({statusCode: 401, message: 'Invalid finalizer token'})
    }

    if (job.status === 'published' || job.step === 'cancelled' || !job.review_message_id) {
        return {success: true, skipped: true}
    }

    await editReelReviewProgress(job, text)
    return {success: true}
})
