import {Markup} from "telegraf"
import {
    REEL_HOOK_OPTIONS_MAX,
    REEL_REVIEW_HOOKS,
    REEL_REVIEW_PICK_HOOK,
    REEL_REVIEW_REBUILD
} from "#server/bot/callbacks/routes"

// Кнопки проверки Reel перед публикацией (ручная ветка, см. TASKS.md).

export const reelReviewRebuildButton = (jobId: string) =>
    Markup.button.callback('🔁 Пересобрать', REEL_REVIEW_REBUILD.encode({jobId}))

export const reelReviewHooksButton = (jobId: string) =>
    Markup.button.callback('✨ Сгенерировать хук', REEL_REVIEW_HOOKS.encode({jobId}))

export const reelReviewPickHookButton = (jobId: string, option: number) =>
    Markup.button.callback(String(option), REEL_REVIEW_PICK_HOOK.encode({jobId, option}))

/** Под clean-видео: пересобрать или перейти к хукам. */
export const reelCleanReviewKeyboard = (jobId: string) =>
    Markup.inlineKeyboard([
        [reelReviewRebuildButton(jobId), reelReviewHooksButton(jobId)]
    ]).reply_markup

/** Под вариантами хука: по кнопке на вариант, в один ряд. */
export const reelHookChoiceKeyboard = (jobId: string, optionsCount: number) => {
    const count = Math.max(1, Math.min(REEL_HOOK_OPTIONS_MAX, optionsCount))

    return Markup.inlineKeyboard([
        Array.from({length: count}, (_, index) => reelReviewPickHookButton(jobId, index + 1))
    ]).reply_markup
}
