import {timingSafeEqual} from 'node:crypto'
import {serverSupabaseServiceRole} from '#supabase/server'
import {finalizeReelPublication} from '#server/global/engine/instagram/reel/jobs/finalizeReelPublication'

const safeTokenEquals = (received: unknown, expected: unknown): boolean => {
    if (typeof received !== 'string' || typeof expected !== 'string') return false
    if (!received || !expected) return false

    const receivedBuffer = Buffer.from(received)
    const expectedBuffer = Buffer.from(expected)
    if (receivedBuffer.length !== expectedBuffer.length) return false

    return timingSafeEqual(receivedBuffer, expectedBuffer)
}

export default defineEventHandler(async (event) => {
    const body = await readBody(event)
    const jobId = String(body?.jobId ?? '').trim()
    const callbackToken = body?.callbackToken

    if (!jobId || !/^[0-9a-f-]{36}$/i.test(jobId)) {
        throw createError({statusCode: 400, message: 'jobId is invalid'})
    }

    const supabase = serverSupabaseServiceRole(event) as any
    const {data: job, error} = await supabase
        .from('reel_processing_jobs')
        .select('id,input_payload,status,step')
        .eq('id', jobId)
        .maybeSingle()

    if (error) {
        throw createError({statusCode: 500, message: `Job lookup failed: ${error.message}`})
    }
    if (!job) {
        throw createError({statusCode: 404, message: 'Reel job not found'})
    }

    const inputPayload = job.input_payload && typeof job.input_payload === 'object'
        ? job.input_payload as Record<string, unknown>
        : null
    const expectedToken = inputPayload?.finalizerToken
    if (!safeTokenEquals(callbackToken, expectedToken)) {
        throw createError({statusCode: 401, message: 'Invalid finalizer token'})
    }

    const result = await finalizeReelPublication(supabase, jobId)
    if (result.status === 'in_progress') {
        setResponseStatus(event, 202)
    }

    return {
        success: true,
        ...result
    }
})
