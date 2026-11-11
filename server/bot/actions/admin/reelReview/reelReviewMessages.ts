import type {Telegraf} from "telegraf"
import {
    getReelReviewJob,
    readFragments,
    readHookOptions,
    type ReelReviewJob,
    setReelReviewMessage
} from "#server/global/engine/instagram/reel/jobs/reelReview"
import {formatClock, FRAGMENTS_PER_PAGE} from "#server/global/engine/instagram/reel/fragments/types"
import {getSupabase} from "#server/global/engine/instagram/reel/jobs/dispatchReelJob"
import {resetAdminPublishLock} from "#server/global/engine/instagram/reel/jobs/adminPublishLock"
import {
    reelCleanReviewKeyboard,
    reelFragmentChoiceKeyboard,
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

const REVIEW_HOURS_HINT = 'Если ничего не выбрать за 24 часа, публикация отменится и ничего не опубликуется.'

const titleOf = (job: ReelReviewJob): string => {
    const content = job.input_payload?.content
    const title = typeof content?.title === 'string' ? content.title.trim() : ''
    return title ? `«${title}»` : `${job.media_type} ${job.media_id}`
}

// Первая строка ошибки, без стека: администратору достаточно причины.
const shortError = (error: string | null): string =>
    String(error ?? '').split('\n')[0]!.replace(/^\w*Error:\s*/, '').slice(0, 300)

const adminChatId = (job: ReelReviewJob): number => Number(job.admin_telegram_id)

/**
 * Удалить текущее сообщение проверки и, если был показан, альбом превью фрагментов
 * (input_payload.fragmentMessageIds).
 */
export const deleteReelReviewMessage = async (
    job: Pick<ReelReviewJob, 'id' | 'admin_telegram_id' | 'review_message_id'> & {input_payload?: ReelReviewJob['input_payload']}
) => {
    const albumIds = Array.isArray(job.input_payload?.fragmentMessageIds)
        ? (job.input_payload!.fragmentMessageIds as unknown[]).map(Number).filter(Number.isFinite)
        : []
    const ids = [...albumIds, ...(job.review_message_id ? [Number(job.review_message_id)] : [])]
    if (!ids.length) return

    const bot = await getBot()
    for (const id of ids) {
        try {
            await bot.telegram.deleteMessage(Number(job.admin_telegram_id), id)
        } catch (error: any) {
            // Сообщение могли удалить руками или оно старше 48 часов (Telegram не даёт удалить).
            console.warn('[REEL REVIEW MESSAGE DELETE SKIPPED]', error?.response?.description || error?.message || error)
        }
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
    const clip = job.input_payload?.videoType === 'clip' && readFragments(job).length > 0
    const chosen = job.input_payload?.fragment as {start?: number, end?: number, title?: string} | null | undefined
    const hasChosen = clip && chosen && Number.isFinite(chosen.start) && Number.isFinite(chosen.end)

    const lines = hasChosen
        ? [
            `🎬 Clean для ${titleOf(job)}: ${formatClock(chosen!.start!)}–${formatClock(chosen!.end!)}${chosen!.title ? `, «${chosen!.title}»` : ''}.`,
            'Посмотри видео: «Другой фрагмент» вернёт к альбому вариантов, «Сгенерировать хук» перейдёт к выбору хука.',
            REVIEW_HOURS_HINT
        ]
        : [
            `🎬 Clean для ${titleOf(job)}, фрагмент ${(Number(job.clean_variant) || 0) + 1}.`,
            'Посмотри видео: «Пересобрать» возьмёт другой фрагмент трейлера, «Сгенерировать хук» перейдёт к выбору хука.',
            REVIEW_HOURS_HINT
        ]

    if (job.input_payload?.fragmentError) {
        lines.unshift(`⚠️ Gemini не смог предложить фрагменты (${shortError(String(job.input_payload.fragmentError))}), взят фрагмент по умолчанию.`)
    }
    if (job.last_error) {
        lines.unshift(`⚠️ Прошлый шаг не удался: ${shortError(job.last_error)}`)
    }

    const caption = lines.join('\n\n')
    const replyMarkup = reelCleanReviewKeyboard(job.id, {clip: Boolean(hasChosen)})
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
 * Альбом превью фрагментов нарезки (до 4 на страницу) и сообщение с кнопками.
 * Возвращает сообщение с кнопками; номера сообщений альбома сохраняются в задаче,
 * чтобы следующий шаг их удалил.
 */
const sendFragmentChoice = async (job: ReelReviewJob, supabase: ReturnType<typeof getSupabase>): Promise<number> => {
    const bot = await getBot()
    const chatId = adminChatId(job)
    const fragments = readFragments(job)
    if (!fragments.length) throw new Error('[REEL REVIEW] fragment_choice without fragments')

    const pages = Math.ceil(fragments.length / FRAGMENTS_PER_PAGE)
    const page = Math.min(Math.max(0, Number(job.input_payload?.fragmentPage) || 0), pages - 1)
    const first = page * FRAGMENTS_PER_PAGE
    const shown = fragments.slice(first, first + FRAGMENTS_PER_PAGE)

    const headline = (fragment: (typeof fragments)[number], number: number) =>
        `${number}. ${formatClock(fragment.start)}–${formatClock(fragment.end)} (${Math.round(fragment.end - fragment.start)} с)` +
        (fragment.title ? ` — ${fragment.title}` : '')
    const describe = (fragment: (typeof fragments)[number], number: number) =>
        headline(fragment, number) + (fragment.reason ? `\n${fragment.reason}` : '')

    let albumIds: number[] = []
    try {
        const album = await bot.telegram.sendMediaGroup(chatId, shown.map((fragment, index) => ({
            type: 'video' as const,
            media: String(fragment.previewUrl),
            caption: describe(fragment, first + index + 1).slice(0, 1000),
            supports_streaming: true
        })))
        albumIds = album.map(message => message.message_id)
    } catch (error: any) {
        // Telegram не смог забрать превью по ссылкам: ссылки будут в тексте ниже.
        console.error('[REEL REVIEW ALBUM SEND ERROR]', error?.response?.description || error?.message || error)
    }

    const list = albumIds.length
        ? shown.map((fragment, index) => headline(fragment, first + index + 1)).join('\n')
        : shown.map((fragment, index) => `${describe(fragment, first + index + 1)}\n${fragment.previewUrl ?? ''}`).join('\n\n')

    const text = [
        `🎞 Фрагменты для ${titleOf(job)}: ${first + 1}–${first + shown.length} из ${fragments.length}.`,
        list,
        'Нажми номер: из этого фрагмента соберётся clean.',
        REVIEW_HOURS_HINT
    ].join('\n\n')

    const message = await bot.telegram.sendMessage(chatId, text, {
        reply_markup: reelFragmentChoiceKeyboard(job.id, page, FRAGMENTS_PER_PAGE, fragments.length)
    })

    const {error} = await supabase
        .from('reel_processing_jobs')
        .update({input_payload: {...(job.input_payload ?? {}), fragmentMessageIds: albumIds}})
        .eq('id', job.id)
    if (error) console.error('[REEL REVIEW ALBUM IDS SAVE ERROR]', error.message)

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
        : job.step === 'fragment_choice'
            ? await sendFragmentChoice(job, supabase)
            : await sendCleanReview(job)

    await setReelReviewMessage(job.id, messageId, supabase)

    // Проверка может ждать часами: снимаем блокировку «публикация идёт» с сессии,
    // иначе бот перехватывал бы обычные сообщения администратора.
    await resetAdminPublishLock(supabase, job)

    console.log('[REEL REVIEW MESSAGE SENT]', {jobId, step: job.step, messageId})

    return {status: 'awaiting_review', step: job.step}
}
