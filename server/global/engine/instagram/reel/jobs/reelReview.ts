import {getSupabase, startQueuedJob} from "#server/global/engine/instagram/reel/jobs/dispatchReelJob"

/**
 * Переходы задачи Reel на шагах ручной проверки (см. TASKS.md).
 *
 * awaiting_review/clean_review --«Пересобрать»-------> queued(clean, variant+1)
 * awaiting_review/clean_review --«Сгенерировать хук»-> queued(hooks)
 * awaiting_review/hook_choice  --«1»–«4»-------------> queued(finish, chosenHook)
 * awaiting_review/*            --истекло 24 ч--------> queued(finish, без хука, review_mode=auto)
 *
 * Каждый переход — условный update по текущему статусу и шагу: второе нажатие той же
 * кнопки, нажатие старой кнопки или гонка с истечением просто ничего не находят.
 */

export type ReelReviewStep = 'clean_review' | 'hook_choice'

export type ReelReviewJob = {
    id: string
    status: string
    step: string
    admin_telegram_id: number | string
    media_id: number | string
    media_type: string
    content_type: string
    key_trailer: string
    input_payload: Record<string, any> | null
    review_mode: string
    worker_phase: string
    clean_variant: number
    clean_preview_r2_url: string | null
    hook_options: unknown
    review_message_id: number | null
    review_expires_at: string | null
    last_error: string | null
}

const REVIEW_COLUMNS =
    'id,status,step,admin_telegram_id,media_id,media_type,content_type,key_trailer,input_payload,' +
    'review_mode,worker_phase,clean_variant,clean_preview_r2_url,hook_options,' +
    'review_message_id,review_expires_at,last_error'

type Supabase = ReturnType<typeof getSupabase>

export const readHookOptions = (job: Pick<ReelReviewJob, 'hook_options'>): string[] =>
    Array.isArray(job.hook_options)
        ? job.hook_options.filter((item): item is string => typeof item === 'string' && item.trim() !== '')
        : []

export const getReelReviewJob = async (
    jobId: string,
    supabase: Supabase = getSupabase()
): Promise<ReelReviewJob | null> => {
    const {data, error} = await supabase
        .from('reel_processing_jobs')
        .select(REVIEW_COLUMNS)
        .eq('id', jobId)
        .maybeSingle()

    if (error) {
        throw new Error(`[REEL REVIEW LOOKUP ERROR] ${error.message}`)
    }

    return (data as unknown as ReelReviewJob | null) ?? null
}

/** Запомнить сообщение с кнопками (или «отправлено на доработку»): следующее его удалит. */
export const setReelReviewMessage = async (
    jobId: string,
    messageId: number | null,
    supabase: Supabase = getSupabase()
): Promise<void> => {
    const {error} = await supabase
        .from('reel_processing_jobs')
        .update({review_message_id: messageId, updated_at: new Date().toISOString()})
        .eq('id', jobId)

    if (error) {
        console.error('[REEL REVIEW MESSAGE SAVE ERROR]', {jobId, error: error.message})
    }
}

/**
 * Условно перевести задачу из awaiting_review/<step> в очередь и запустить воркер.
 * Возвращает задачу до перехода или null, если она уже не на этом шаге.
 */
const requeueFromReview = async ({
    jobId,
    expectedStep,
    patch,
    supabase
}: {
    jobId: string
    expectedStep: ReelReviewStep | ReelReviewStep[]
    patch: (job: ReelReviewJob) => Record<string, unknown> | null
    supabase: Supabase
}): Promise<ReelReviewJob | null> => {
    const job = await getReelReviewJob(jobId, supabase)
    const steps = Array.isArray(expectedStep) ? expectedStep : [expectedStep]

    if (!job || job.status !== 'awaiting_review' || !steps.includes(job.step as ReelReviewStep)) {
        return null
    }

    const update = patch(job)
    if (!update) return null

    const {data, error} = await supabase
        .from('reel_processing_jobs')
        .update({
            ...update,
            status: 'queued',
            step: 'queued',
            review_expires_at: null,
            last_error: null,
            updated_at: new Date().toISOString()
        })
        .eq('id', jobId)
        .eq('status', 'awaiting_review')
        .eq('step', job.step)
        // Вариант clean тот же, что прочитан: двойное «Пересобрать» не прибавит дважды.
        .eq('clean_variant', job.clean_variant)
        .select('id')
        .maybeSingle()

    if (error) {
        throw new Error(`[REEL REVIEW TRANSITION ERROR] ${error.message}`)
    }

    if (!data) return null

    // Запуск воркера. Если Cloud Run не принял запуск, задача остаётся в queued:
    // повторное «Опубликовать» (continueJob) запустит её снова.
    await startQueuedJob(supabase, {id: jobId})

    return job
}

/** «🔁 Пересобрать»: новый фрагмент трейлера, исходник берётся из R2. */
export const requestCleanRebuild = (jobId: string, supabase: Supabase = getSupabase()) =>
    requeueFromReview({
        jobId,
        expectedStep: 'clean_review',
        supabase,
        patch: job => ({
            worker_phase: 'clean',
            clean_variant: (Number(job.clean_variant) || 0) + 1,
            hook_options: null
        })
    })

/** «✨ Сгенерировать хук»: 4 варианта от Gemini по текущему clean. */
export const requestHookOptions = (jobId: string, supabase: Supabase = getSupabase()) =>
    requeueFromReview({
        jobId,
        expectedStep: 'clean_review',
        supabase,
        patch: () => ({
            worker_phase: 'hooks',
            hook_options: null
        })
    })

/**
 * «1»–«4»: выбранный хук идёт в ролик. Возвращает задачу и текст хука или null,
 * если выбор уже не актуален (другое сообщение, истекло, нажато дважды).
 */
export const chooseReelHook = async (
    jobId: string,
    option: number,
    supabase: Supabase = getSupabase()
): Promise<{job: ReelReviewJob, hook: string} | null> => {
    let chosen = ''

    const job = await requeueFromReview({
        jobId,
        expectedStep: 'hook_choice',
        supabase,
        patch: current => {
            chosen = readHookOptions(current)[option - 1] ?? ''
            if (!chosen) return null

            return {
                worker_phase: 'finish',
                input_payload: {...(current.input_payload ?? {}), chosenHook: chosen}
            }
        }
    })

    return job && chosen ? {job, hook: chosen} : null
}

/**
 * Время проверки истекло: дальше без администратора, по ветке без проверки
 * (хук выбирает Gemini по текущему clean). Возвращает задачу, если переход сделан.
 */
export const expireReelReview = (jobId: string, supabase: Supabase = getSupabase()) =>
    requeueFromReview({
        jobId,
        expectedStep: ['clean_review', 'hook_choice'],
        supabase,
        patch: job => {
            const expiresAt = job.review_expires_at ? new Date(job.review_expires_at).getTime() : NaN
            if (!Number.isFinite(expiresAt) || expiresAt > Date.now()) return null

            return {
                worker_phase: 'finish',
                review_mode: 'auto',
                hook_options: null,
                input_payload: {...(job.input_payload ?? {}), chosenHook: null}
            }
        }
    })

/** Задачи, у которых истекло время проверки (не больше `limit` за вызов). */
export const listExpiredReelReviews = async (
    limit = 20,
    supabase: Supabase = getSupabase()
): Promise<string[]> => {
    const {data, error} = await supabase
        .from('reel_processing_jobs')
        .select('id')
        .eq('status', 'awaiting_review')
        .lt('review_expires_at', new Date().toISOString())
        .order('review_expires_at', {ascending: true})
        .limit(limit)

    if (error) {
        throw new Error(`[REEL REVIEW EXPIRY LOOKUP ERROR] ${error.message}`)
    }

    return (data ?? []).map(row => String((row as {id: string}).id))
}
