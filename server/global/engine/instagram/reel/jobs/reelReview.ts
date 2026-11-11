import {getSupabase, startQueuedJob} from "#server/global/engine/instagram/reel/jobs/dispatchReelJob"
import {type ClipFragment, FRAGMENTS_PER_PAGE} from "#server/global/engine/instagram/reel/fragments/types"

/** Сколько ждать решения администратора на шаге проверки (как в воркере, REEL_REVIEW_TIMEOUT_MS). */
const REVIEW_TIMEOUT_MS = 24 * 60 * 60 * 1000

/**
 * Переходы задачи Reel на шагах ручной проверки (см. TASKS.md).
 *
 * awaiting_review/clean_review --«Пересобрать»-------> queued(clean, variant+1)
 * awaiting_review/clean_review --«Сгенерировать хук»-> queued(hooks)
 * awaiting_review/hook_choice  --«1»–«4»-------------> queued(finish, chosenHook)
 * awaiting_review/*            --истекло 24 ч--------> failed/cancelled (ничего не публикуется)
 *
 * Каждый переход — условный update по текущему статусу и шагу: второе нажатие той же
 * кнопки, нажатие старой кнопки или гонка с истечением просто ничего не находят.
 */

export type ReelReviewStep = 'fragment_choice' | 'clean_review' | 'hook_choice'

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

/**
 * «✨ Сгенерировать хук» под clean и «🔁 Новые варианты» под вариантами: Gemini заново
 * пишет варианты по текущему clean.
 */
export const requestHookOptions = (jobId: string, supabase: Supabase = getSupabase()) =>
    requeueFromReview({
        jobId,
        expectedStep: ['clean_review', 'hook_choice'],
        supabase,
        patch: job => ({
            worker_phase: 'hooks',
            hook_options: null,
            input_payload: {...(job.input_payload ?? {}), awaitingCustomHook: false}
        })
    })

/** «✍️ Свой вариант»: задача ждёт текст хука от администратора (input_payload.awaitingCustomHook). */
export const startCustomHook = (jobId: string, supabase: Supabase = getSupabase()) =>
    updateReview({
        jobId,
        expectedStep: 'hook_choice',
        supabase,
        patch: job => ({input_payload: {...(job.input_payload ?? {}), awaitingCustomHook: true}})
    })

/** «◀️ К вариантам»: перестать ждать свой хук. */
export const stopCustomHook = (jobId: string, supabase: Supabase = getSupabase()) =>
    updateReview({
        jobId,
        expectedStep: 'hook_choice',
        supabase,
        patch: job => ({input_payload: {...(job.input_payload ?? {}), awaitingCustomHook: false}})
    })

/** Задача этого администратора, которая ждёт текст своего хука (самая свежая), или null. */
export const findJobAwaitingCustomHook = async (
    adminTelegramId: number,
    supabase: Supabase = getSupabase()
): Promise<ReelReviewJob | null> => {
    const {data, error} = await supabase
        .from('reel_processing_jobs')
        .select(REVIEW_COLUMNS)
        .eq('admin_telegram_id', adminTelegramId)
        .eq('status', 'awaiting_review')
        .eq('step', 'hook_choice')
        .eq('input_payload->>awaitingCustomHook', 'true')
        .order('updated_at', {ascending: false})
        .limit(1)
        .maybeSingle()

    if (error) throw new Error(`[REEL REVIEW CUSTOM HOOK LOOKUP ERROR] ${error.message}`)
    return (data as unknown as ReelReviewJob | null) ?? null
}

/** Текст администратора стал хуком: воркер собирает Reel с ним. */
export const chooseCustomHook = (jobId: string, hook: string, supabase: Supabase = getSupabase()) =>
    requeueFromReview({
        jobId,
        expectedStep: 'hook_choice',
        supabase,
        patch: job => job.input_payload?.awaitingCustomHook
            ? {
                worker_phase: 'finish',
                input_payload: {...(job.input_payload ?? {}), chosenHook: hook, awaitingCustomHook: false}
            }
            : null
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
 * Время проверки истекло (24 ч без нажатий, решение владельца 12.11): вся публикация
 * отменяется, как по кнопке «Отменить» — задача failed/cancelled, ничего не уходит ни в
 * Telegram, ни в Instagram. Возвращает задачу до изменения, если переход сделан.
 */
export const expireReelReview = async (
    jobId: string,
    supabase: Supabase = getSupabase()
): Promise<ReelReviewJob | null> => {
    const job = await getReelReviewJob(jobId, supabase)
    if (!job || job.status !== 'awaiting_review') return null

    const expiresAt = job.review_expires_at ? new Date(job.review_expires_at).getTime() : NaN
    if (!Number.isFinite(expiresAt) || expiresAt > Date.now()) return null

    const {data, error} = await supabase
        .from('reel_processing_jobs')
        .update({
            status: 'failed',
            step: REEL_CANCELLED_STEP,
            last_error: 'Время выбора истекло (24 часа): публикация отменена',
            failed_at: new Date().toISOString(),
            review_expires_at: null,
            hook_options: null,
            lease_token: null,
            lease_expires_at: null,
            updated_at: new Date().toISOString()
        })
        .eq('id', jobId)
        .eq('status', 'awaiting_review')
        .eq('step', job.step)
        .select('id')
        .maybeSingle()

    if (error) throw new Error(`[REEL REVIEW EXPIRY ERROR] ${error.message}`)
    return data ? job : null
}

/**
 * Статусы, из которых проверку можно отменить. Пока воркер работает (queued,
 * processing), отмена снимает с задачи lease: воркер на следующей записи получает
 * «JOB LEASE LOST» и завершается, ничего не сохранив и не вызвав финализатор.
 * ready/publishing — уже публикуется, отменить нельзя.
 */
const CANCELLABLE_STATUSES = ['awaiting_review', 'queued', 'processing']

export const REEL_CANCELLED_STEP = 'cancelled'

export type CancelReelReviewResult =
    | {cancelled: true, job: ReelReviewJob}
    | {cancelled: false, reason: 'not_found' | 'not_manual' | 'publishing' | 'finished'}

/**
 * «✖️ Отменить»: остановить цикл ручной проверки. Задача становится failed/cancelled:
 * финализатор такой шаг не подхватывает (ни Telegram, ни Instagram), а повторное
 * «Опубликовать» удаляет запись и начинает новый цикл (как после любой завершённой задачи).
 */
export const cancelReelReview = async (
    jobId: string,
    supabase: Supabase = getSupabase()
): Promise<CancelReelReviewResult> => {
    // Статус мог смениться между чтением и записью (воркер закончил фазу):
    // повторяем по свежему состоянию.
    for (let attempt = 0; attempt < 3; attempt++) {
        const result = await tryCancelReelReview(jobId, supabase)
        if (result !== 'retry') return result
    }
    return {cancelled: false, reason: 'finished'}
}

const tryCancelReelReview = async (
    jobId: string,
    supabase: Supabase
): Promise<CancelReelReviewResult | 'retry'> => {
    const job = await getReelReviewJob(jobId, supabase)

    if (!job) return {cancelled: false, reason: 'not_found'}
    if (job.review_mode !== 'manual') return {cancelled: false, reason: 'not_manual'}
    if (job.status === 'ready' || job.status === 'publishing') return {cancelled: false, reason: 'publishing'}
    if (!CANCELLABLE_STATUSES.includes(job.status)) return {cancelled: false, reason: 'finished'}

    const {data, error} = await supabase
        .from('reel_processing_jobs')
        .update({
            status: 'failed',
            step: REEL_CANCELLED_STEP,
            last_error: 'Отменено администратором',
            failed_at: new Date().toISOString(),
            review_expires_at: null,
            hook_options: null,
            lease_token: null,
            lease_expires_at: null,
            updated_at: new Date().toISOString()
        })
        .eq('id', jobId)
        // Тот же статус, что прочитан: гонка с воркером или таймером ничего не сломает.
        .eq('status', job.status)
        .select('id')
        .maybeSingle()

    if (error) {
        throw new Error(`[REEL REVIEW CANCEL ERROR] ${error.message}`)
    }

    if (!data) return 'retry'

    return {cancelled: true, job}
}

/** Фрагменты нарезки, предложенные Gemini (input_payload.fragments). */
export const readFragments = (job: Pick<ReelReviewJob, 'input_payload'>): ClipFragment[] =>
    Array.isArray(job.input_payload?.fragments)
        ? (job.input_payload!.fragments as ClipFragment[]).filter(f =>
            Number.isFinite(f?.start) && Number.isFinite(f?.end) && f.end > f.start)
        : []

/**
 * Условно изменить задачу на шаге проверки без запуска воркера (листание альбома,
 * возврат к фрагментам). Возвращает задачу до изменения или null, если она уже не там.
 */
const updateReview = async ({
    jobId,
    expectedStep,
    patch,
    supabase
}: {
    jobId: string
    expectedStep: ReelReviewStep
    patch: (job: ReelReviewJob) => Record<string, unknown> | null
    supabase: Supabase
}): Promise<ReelReviewJob | null> => {
    const job = await getReelReviewJob(jobId, supabase)
    if (!job || job.status !== 'awaiting_review' || job.step !== expectedStep) return null

    const update = patch(job)
    if (!update) return null

    const {data, error} = await supabase
        .from('reel_processing_jobs')
        .update({...update, updated_at: new Date().toISOString()})
        .eq('id', jobId)
        .eq('status', 'awaiting_review')
        .eq('step', expectedStep)
        .select('id')
        .maybeSingle()

    if (error) throw new Error(`[REEL REVIEW UPDATE ERROR] ${error.message}`)
    return data ? job : null
}

/** «Следующие варианты» / «◀️ Назад»: страница альбома фрагментов. */
export const setFragmentPage = (jobId: string, page: number, supabase: Supabase = getSupabase()) =>
    updateReview({
        jobId,
        expectedStep: 'fragment_choice',
        supabase,
        patch: job => {
            const pages = Math.ceil(readFragments(job).length / FRAGMENTS_PER_PAGE)
            if (page < 0 || page >= pages) return null
            return {input_payload: {...(job.input_payload ?? {}), fragmentPage: page}}
        }
    })

/** Номер фрагмента (1–8): воркер собирает clean из него. */
export const chooseReelFragment = async (
    jobId: string,
    number: number,
    supabase: Supabase = getSupabase()
): Promise<{job: ReelReviewJob, fragment: ClipFragment} | null> => {
    let chosen: ClipFragment | undefined

    const job = await requeueFromReview({
        jobId,
        expectedStep: 'fragment_choice',
        supabase,
        patch: current => {
            chosen = readFragments(current)[number - 1]
            if (!chosen) return null
            return {
                worker_phase: 'clean',
                clean_variant: 0,
                hook_options: null,
                input_payload: {...(current.input_payload ?? {}), fragment: chosen, chosenHook: null}
            }
        }
    })

    return job && chosen ? {job, fragment: chosen} : null
}

/**
 * «🎞 Другой фрагмент» под clean нарезки: обратно к альбому (первая страница), без
 * воркера — фрагменты и их превью уже готовы.
 */
export const backToFragments = (jobId: string, supabase: Supabase = getSupabase()) =>
    updateReview({
        jobId,
        expectedStep: 'clean_review',
        supabase,
        patch: job => readFragments(job).length
            ? {
                step: 'fragment_choice',
                input_payload: {...(job.input_payload ?? {}), fragmentPage: 0, fragment: null},
                review_expires_at: new Date(Date.now() + REVIEW_TIMEOUT_MS).toISOString(),
                last_error: null
            }
            : null
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
