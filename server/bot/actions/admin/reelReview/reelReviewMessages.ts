import type {Telegraf} from "telegraf"
import {
    getReelReviewJob,
    readHookOptions,
    type ReelReviewJob,
    setReelReviewMessage
} from "#server/global/engine/instagram/reel/jobs/reelReview"
import {getSupabase} from "#server/global/engine/instagram/reel/jobs/dispatchReelJob"
import {resetAdminPublishLock} from "#server/global/engine/instagram/reel/jobs/adminPublishLock"
import {
    reelCleanReviewKeyboard,
    reelHookChoiceKeyboard,
    reelReviewProgressKeyboard
} from "#server/bot/consts/buttons/admin/buttonsReelReview"

/**
 * Сообщения проверки Reel в чате администратора. Отправляет их только бот (Vercel):
 * воркер, закончив фазу, ставит awaiting_review и зовёт финализатор, а тот — сюда.
 *
 * В чате всегда одно сообщение проверки на задачу: перед новым удаляется прошлое
 * (`review_message_id`), в том числе «Видео отправлено на доработку».
 */

// Бот берётся при отправке, а не при загрузке модуля: этот модуль подключают обработчики
// кнопок, которые сами загружаются при создании бота. Статический импорт `#server/bot/bot`
// давал цикл, и на Vercel падал весь модуль бота (webhook, finalize).
const getBot = async (): Promise<Telegraf> => (await import("#server/bot/bot")).bot

const REVIEW_HOURS_HINT = 'Если ничего не выбрать за 24 часа, хук выберет Gemini и ролик опубликуется сам.'

const titleOf = (job: ReelReviewJob): string => {
    const content = job.input_payload?.content
    const title = typeof content?.title === 'string' ? content.title.trim() : ''
    return title ? `«${title}»` : `${job.media_type} ${job.media_id}`
}

// Первая строка ошибки, без стека: администратору достаточно причины.
const shortError = (error: string | null): string =>
    String(error ?? '').split('\n')[0]!.replace(/^\w*Error:\s*/, '').slice(0, 300)

const adminChatId = (job: ReelReviewJob): number => Number(job.admin_telegram_id)

export const deleteReelReviewMessage = async (job: Pick<ReelReviewJob, 'id' | 'admin_telegram_id' | 'review_message_id'>) => {
    if (!job.review_message_id) return

    try {
        await (await getBot()).telegram.deleteMessage(Number(job.admin_telegram_id), Number(job.review_message_id))
    } catch (error: any) {
        // Сообщение могли удалить руками или оно старше 48 часов (Telegram не даёт удалить).
        console.warn('[REEL REVIEW MESSAGE DELETE SKIPPED]', error?.response?.description || error?.message || error)
    }
}

/**
 * Короткое сообщение о состоянии; становится «текущим» и удалится следующим.
 * `withCancel`: под ним кнопка «Отменить» (пока воркер работает над шагом).
 */
export const sendReelReviewStatus = async (
    job: Pick<ReelReviewJob, 'id' | 'admin_telegram_id'>,
    text: string,
    {withCancel = false}: {withCancel?: boolean} = {}
) => {
    try {
        const message = await (await getBot()).telegram.sendMessage(
            Number(job.admin_telegram_id),
            text,
            withCancel ? {reply_markup: reelReviewProgressKeyboard(job.id)} : undefined
        )
        await setReelReviewMessage(job.id, message.message_id)
    } catch (error: any) {
        console.error('[REEL REVIEW STATUS ERROR]', error?.response?.description || error?.message || error)
    }
}

const sendCleanReview = async (job: ReelReviewJob): Promise<number> => {
    const bot = await getBot()
    const chatId = adminChatId(job)
    const fragment = (Number(job.clean_variant) || 0) + 1
    const lines = [
        `🎬 Clean для ${titleOf(job)}, фрагмент ${fragment}.`,
        'Посмотри видео: «Пересобрать» возьмёт другой фрагмент трейлера, «Сгенерировать хук» перейдёт к выбору хука.',
        REVIEW_HOURS_HINT
    ]

    if (job.last_error) {
        lines.unshift(`⚠️ Прошлый шаг не удался: ${shortError(job.last_error)}`)
    }

    const caption = lines.join('\n\n')
    const replyMarkup = reelCleanReviewKeyboard(job.id)
    const previewUrl = String(job.clean_preview_r2_url ?? '').trim()

    if (previewUrl) {
        try {
            const message = await bot.telegram.sendVideo(chatId, previewUrl, {
                caption,
                supports_streaming: true,
                reply_markup: replyMarkup
            })
            return message.message_id
        } catch (error: any) {
            // Telegram не смог забрать видео по ссылке: присылаем ссылку текстом.
            console.error('[REEL REVIEW VIDEO SEND ERROR]', error?.response?.description || error?.message || error)
        }
    }

    const message = await bot.telegram.sendMessage(
        chatId,
        previewUrl ? `${caption}\n\nВидео: ${previewUrl}` : caption,
        {reply_markup: replyMarkup}
    )
    return message.message_id
}

const sendHookChoice = async (job: ReelReviewJob): Promise<number> => {
    const bot = await getBot()
    const options = readHookOptions(job)

    if (!options.length) {
        throw new Error('[REEL REVIEW] hook_choice without hook options')
    }

    const text = [
        `✍️ Варианты хука для ${titleOf(job)}:`,
        options.map((hook, index) => `${index + 1}. ${hook}`).join('\n'),
        'Нажми номер: этот хук встанет на видео.',
        REVIEW_HOURS_HINT
    ].join('\n\n')

    const message = await bot.telegram.sendMessage(adminChatId(job), text, {
        reply_markup: reelHookChoiceKeyboard(job.id, options.length)
    })

    return message.message_id
}

/**
 * Прислать администратору текущий шаг проверки задачи. Вызывается финализатором,
 * когда воркер закончил фазу (status=awaiting_review), и при повторном «Опубликовать».
 */
export const sendReelReviewMessage = async (jobId: string): Promise<{status: 'awaiting_review', step: string}> => {
    const supabase = getSupabase()
    const job = await getReelReviewJob(jobId, supabase)

    if (!job || job.status !== 'awaiting_review') {
        throw new Error(`[REEL REVIEW] Job ${jobId} is not waiting for review (status: ${job?.status ?? 'not found'})`)
    }

    await deleteReelReviewMessage(job)

    const messageId = job.step === 'hook_choice'
        ? await sendHookChoice(job)
        : await sendCleanReview(job)

    await setReelReviewMessage(job.id, messageId, supabase)

    // Проверка может ждать часами: снимаем блокировку «публикация идёт» с сессии,
    // иначе бот перехватывал бы обычные сообщения администратора.
    await resetAdminPublishLock(supabase, job)

    console.log('[REEL REVIEW MESSAGE SENT]', {jobId, step: job.step, messageId})

    return {status: 'awaiting_review', step: job.step}
}
