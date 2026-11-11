import {
    REEL_REVIEW_CANCEL,
    REEL_REVIEW_FRAGMENT_PAGE,
    REEL_REVIEW_HOOKS,
    REEL_REVIEW_PICK_FRAGMENT,
    REEL_REVIEW_PICK_HOOK,
    REEL_REVIEW_REBUILD
} from "#server/bot/callbacks/routes"
import {
    backToFragments,
    cancelReelReview,
    chooseReelFragment,
    chooseReelHook,
    getReelReviewJob,
    readFragments,
    type ReelReviewJob,
    requestCleanRebuild,
    requestHookOptions,
    setFragmentPage
} from "#server/global/engine/instagram/reel/jobs/reelReview"
import {
    deleteReelReviewMessage,
    sendReelReviewMessage,
    sendReelReviewStatus
} from "#server/bot/actions/admin/reelReview/reelReviewMessages"
import {formatClock} from "#server/global/engine/instagram/reel/fragments/types"
import {deleteReelTempFiles} from "#server/global/engine/instagram/reel/jobs/reelStorageCleanup"
import {deleteOldMessagesSession} from "#server/bot/services/session/deleteOldMessagesSession"

/**
 * Кнопки проверки Reel (только администратор, см. registerAdminActions).
 * Каждое нажатие — условный переход задачи; если задача уже не на этом шаге
 * (нажато дважды, старое сообщение, время выбора истекло), кнопки снимаются.
 */

const answer = async (ctx: any, text?: string) => {
    try {
        await ctx.answerCbQuery(text)
    } catch {
        // Callback мог устареть: ответ необязателен.
    }
}

const STALE_TEXT = 'Этот выбор уже не актуален: время вышло или задача ушла дальше.'

// Устаревшее сообщение: убираем кнопки, чтобы их не нажимали снова.
const dropStaleKeyboard = async (ctx: any) => {
    await answer(ctx, STALE_TEXT)

    try {
        await ctx.editMessageReplyMarkup(undefined)
    } catch {
        // Уже без кнопок или удалено.
    }
}

// Нажатое сообщение удаляется (оно и есть review_message_id), его место занимает статус.
// Пока воркер работает над шагом, под статусом кнопка «Отменить».
const replaceWithStatus = async (
    ctx: any,
    job: ReelReviewJob,
    text: string,
    {withCancel = true}: {withCancel?: boolean} = {}
) => {
    await deleteReelReviewMessage({
        id: job.id,
        admin_telegram_id: job.admin_telegram_id,
        review_message_id: ctx.callbackQuery?.message?.message_id ?? job.review_message_id,
        // Альбом превью фрагментов (если был) удаляется вместе с сообщением.
        input_payload: job.input_payload
    })
    await sendReelReviewStatus(job, text, {withCancel})
}

const reportStartError = async (ctx: any, action: string, error: unknown) => {
    console.error(`[REEL REVIEW ${action} ERROR]`, error)
    await answer(ctx, 'Не удалось запустить обработку')

    try {
        await ctx.reply(
            'Не удалось запустить обработку видео. Задача в очереди: нажми «Опубликовать» на карточке ещё раз, ' +
            'и она продолжится с этого шага.'
        )
    } catch {
        // Сообщение необязательно.
    }
}

export const reelReviewRebuild = async (ctx: any) => {
    const {jobId} = REEL_REVIEW_REBUILD.parse(ctx)

    // Нарезка: «🎞 Другой фрагмент» — обратно к альбому вариантов, без воркера.
    const current = await getReelReviewJob(jobId).catch(() => null)
    if (current?.input_payload?.videoType === 'clip' && readFragments(current).length) {
        let back: ReelReviewJob | null
        try {
            back = await backToFragments(jobId)
        } catch (error) {
            return reportStartError(ctx, 'BACK TO FRAGMENTS', error)
        }
        if (!back) return dropStaleKeyboard(ctx)

        await answer(ctx, 'Возвращаю к фрагментам')
        await sendReelReviewMessage(jobId)
        return
    }

    let job: ReelReviewJob | null
    try {
        job = await requestCleanRebuild(jobId)
    } catch (error) {
        return reportStartError(ctx, 'REBUILD', error)
    }

    if (!job) return dropStaleKeyboard(ctx)

    await answer(ctx, 'Пересобираю clean')
    await replaceWithStatus(ctx, job, '🔁 Видео отправлено на доработку: собираю другой фрагмент трейлера.')
}

export const reelReviewGenerateHooks = async (ctx: any) => {
    const {jobId} = REEL_REVIEW_HOOKS.parse(ctx)

    let job: ReelReviewJob | null
    try {
        job = await requestHookOptions(jobId)
    } catch (error) {
        return reportStartError(ctx, 'HOOKS', error)
    }

    if (!job) return dropStaleKeyboard(ctx)

    await answer(ctx, 'Генерирую варианты хука')
    await replaceWithStatus(ctx, job, '✨ Gemini смотрит видео и пишет варианты хука. Это займёт пару минут.')
}

/** «1»–«8» под альбомом фрагментов: clean собирается из выбранного фрагмента. */
export const reelReviewPickFragment = async (ctx: any) => {
    const {jobId, fragment: number} = REEL_REVIEW_PICK_FRAGMENT.parse(ctx)

    let result: Awaited<ReturnType<typeof chooseReelFragment>>
    try {
        result = await chooseReelFragment(jobId, number)
    } catch (error) {
        return reportStartError(ctx, 'PICK FRAGMENT', error)
    }

    if (!result) return dropStaleKeyboard(ctx)

    const {fragment} = result
    await answer(ctx, `Выбран фрагмент ${number}`)
    await replaceWithStatus(
        ctx,
        result.job,
        `🎬 Фрагмент ${number}: ${formatClock(fragment.start)}–${formatClock(fragment.end)}` +
        `${fragment.title ? `, «${fragment.title}»` : ''}. Собираю clean со слежением за лицом.`
    )
}

/** «Следующие варианты (N)» / «◀️ Назад»: другая страница альбома, без воркера. */
export const reelReviewFragmentPage = async (ctx: any) => {
    const {jobId, page} = REEL_REVIEW_FRAGMENT_PAGE.parse(ctx)

    let job: ReelReviewJob | null
    try {
        job = await setFragmentPage(jobId, page)
    } catch (error) {
        console.error('[REEL REVIEW FRAGMENT PAGE ERROR]', error)
        return answer(ctx, 'Не удалось переключить варианты, попробуй ещё раз')
    }

    if (!job) return dropStaleKeyboard(ctx)

    await answer(ctx, page > 0 ? 'Следующие варианты' : 'Первые варианты')
    await sendReelReviewMessage(jobId)
}

export const reelReviewCancel = async (ctx: any) => {
    const {jobId} = REEL_REVIEW_CANCEL.parse(ctx)

    let result: Awaited<ReturnType<typeof cancelReelReview>>
    try {
        result = await cancelReelReview(jobId)
    } catch (error) {
        console.error('[REEL REVIEW CANCEL ERROR]', error)
        return answer(ctx, 'Не удалось отменить, попробуй ещё раз')
    }

    if (!result.cancelled) {
        if (result.reason === 'publishing') {
            return answer(ctx, 'Ролик уже публикуется, отменить нельзя')
        }
        return dropStaleKeyboard(ctx)
    }

    const {job} = result
    await answer(ctx, 'Отменено')

    // Сообщение проверки могло быть другим, не тем, что нажато (например, кнопка под
    // статусом): убираем оба.
    const pressedId = ctx.callbackQuery?.message?.message_id
    if (job.review_message_id && job.review_message_id !== pressedId) {
        await deleteReelReviewMessage(job)
    }

    await replaceWithStatus(
        ctx,
        job,
        '✖️ Публикация отменена: ничего не опубликовано. Чтобы начать заново, нажми «Опубликовать» на карточке.',
        {withCancel: false}
    )

    // Исходник и превью держались в R2 ради проверки; clean остаётся кэшем, как обычно.
    await deleteReelTempFiles({mediaId: job.media_id, mediaType: job.media_type, keyTrailer: job.key_trailer})

    // Чат администратора: сообщения, отмеченные в сессии (ссылка, тип видео и т. п.),
    // удаляются его же функцией, как по /clear. Уведомление об отмене остаётся.
    try {
        await deleteOldMessagesSession(ctx.from.id)
    } catch (error) {
        console.error('[REEL REVIEW CANCEL CHAT CLEANUP ERROR]', error)
    }

    console.log('[REEL REVIEW CANCELLED]', {jobId, status: job.status, step: job.step})
}

export const reelReviewPickHook = async (ctx: any) => {
    const {jobId, option} = REEL_REVIEW_PICK_HOOK.parse(ctx)

    let result: Awaited<ReturnType<typeof chooseReelHook>>
    try {
        result = await chooseReelHook(jobId, option)
    } catch (error) {
        return reportStartError(ctx, 'PICK', error)
    }

    if (!result) {
        // Вариант мог не существовать (кнопка от другого набора) — проверим, жива ли задача.
        const job = await getReelReviewJob(jobId).catch(() => null)
        if (job?.status === 'awaiting_review' && job.step === 'hook_choice') {
            return answer(ctx, 'Такого варианта нет, выбери другой номер')
        }
        return dropStaleKeyboard(ctx)
    }

    await answer(ctx, `Выбран вариант ${option}`)
    await replaceWithStatus(
        ctx,
        result.job,
        `✅ Хук: «${result.hook}». Собираю Reel (субтитры, оформление), потом опубликую.`
    )
}
