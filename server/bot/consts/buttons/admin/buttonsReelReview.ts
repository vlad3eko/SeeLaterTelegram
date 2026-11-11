import {Markup} from "telegraf"
import {
    REEL_HOOK_OPTIONS_MAX,
    REEL_REVIEW_CANCEL,
    REEL_REVIEW_FRAGMENT_PAGE,
    REEL_REVIEW_HOOKS,
    REEL_REVIEW_PICK_FRAGMENT,
    REEL_REVIEW_PICK_HOOK,
    REEL_REVIEW_REBUILD
} from "#server/bot/callbacks/routes"

// Кнопки проверки Reel перед публикацией (ручная ветка, см. TASKS.md).

/** «Пересобрать»; у нарезки та же кнопка возвращает к выбору фрагмента. */
export const reelReviewRebuildButton = (jobId: string, {clip = false}: {clip?: boolean} = {}) =>
    Markup.button.callback(clip ? '🎞 Другой фрагмент' : '🔁 Пересобрать', REEL_REVIEW_REBUILD.encode({jobId}))

export const reelReviewHooksButton = (jobId: string) =>
    Markup.button.callback('✨ Сгенерировать хук', REEL_REVIEW_HOOKS.encode({jobId}))

export const reelReviewPickHookButton = (jobId: string, option: number) =>
    Markup.button.callback(String(option), REEL_REVIEW_PICK_HOOK.encode({jobId, option}))

export const reelReviewCancelButton = (jobId: string) =>
    Markup.button.callback('✖️ Отменить', REEL_REVIEW_CANCEL.encode({jobId}))

/** Под clean-видео: пересобрать (у нарезки — другой фрагмент), к хукам или отменить всё. */
export const reelCleanReviewKeyboard = (jobId: string, {clip = false}: {clip?: boolean} = {}) =>
    Markup.inlineKeyboard([
        [reelReviewRebuildButton(jobId, {clip}), reelReviewHooksButton(jobId)],
        [reelReviewCancelButton(jobId)]
    ]).reply_markup

/** Под сообщением «идёт обработка»: только отмена. */
export const reelReviewProgressKeyboard = (jobId: string) =>
    Markup.inlineKeyboard([
        [reelReviewCancelButton(jobId)]
    ]).reply_markup

/** Под вариантами хука: по кнопке на вариант, в один ряд. */
export const reelHookChoiceKeyboard = (jobId: string, optionsCount: number) => {
    const count = Math.max(1, Math.min(REEL_HOOK_OPTIONS_MAX, optionsCount))

    return Markup.inlineKeyboard([
        Array.from({length: count}, (_, index) => reelReviewPickHookButton(jobId, index + 1)),
        [reelReviewCancelButton(jobId)]
    ]).reply_markup
}

/**
 * Под альбомом фрагментов нарезки: номера фрагментов этой страницы (сквозные, 1–8),
 * «Следующие варианты (N)» — N ещё не показанных, на второй странице «◀️ Назад».
 */
export const reelFragmentChoiceKeyboard = (
    jobId: string,
    page: number,
    perPage: number,
    total: number
) => {
    const first = page * perPage
    const numbers = Array.from(
        {length: Math.max(0, Math.min(perPage, total - first))},
        (_, index) => Markup.button.callback(
            String(first + index + 1),
            REEL_REVIEW_PICK_FRAGMENT.encode({jobId, fragment: first + index + 1})
        )
    )

    const navigation = []
    if (page > 0) {
        navigation.push(Markup.button.callback('◀️ Назад', REEL_REVIEW_FRAGMENT_PAGE.encode({jobId, page: page - 1})))
    }
    const remaining = total - (first + perPage)
    if (remaining > 0) {
        navigation.push(Markup.button.callback(
            `Следующие варианты (${remaining})`,
            REEL_REVIEW_FRAGMENT_PAGE.encode({jobId, page: page + 1})
        ))
    }

    return Markup.inlineKeyboard([
        numbers,
        ...(navigation.length ? [navigation] : []),
        [reelReviewCancelButton(jobId)]
    ]).reply_markup
}
