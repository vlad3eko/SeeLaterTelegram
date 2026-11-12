
import {publishAdminInlineMedia} from "#server/bot/actions/admin/publishAdminInlineMedia";
import {editAdminInlineMedia} from "#server/bot/actions/admin/editAdminInlineMedia";
import {adminEditMedia} from "#server/bot/actions/admin/session/mods/adminEditMedia";
import {adminEditText} from "#server/bot/actions/admin/session/mods/adminEditText";
import {getAdminEditSession} from "#server/bot/actions/admin/adminEditSession";
import {adminEditActionInlineMessage} from "#server/bot/actions/admin/adminEditActionInlineMessage";
import {Telegraf} from "telegraf";
import {adminEditOverview} from "#server/bot/actions/admin/session/mods/adminEditOverview";
import {adminEditTypeCard} from "#server/bot/actions/admin/card/adminEditTypeCard";
import {adminDownloadTrailer} from "#server/bot/actions/admin/session/mods/adminDownloadTrailer";
import {adminAddTrailerKey} from "#server/bot/actions/admin/session/adminAddTrailerKey";
import {isAdmin} from "#server/bot/consts/admins";
import {adminChooseVideoType} from "#server/bot/actions/admin/session/adminChooseVideoType";
import {
    ADMIN_CHANGE_TRAILER_KEY,
    ADMIN_DOWNLOAD_TRAILER,
    ADMIN_EDIT_CARD,
    ADMIN_EDIT_MEDIA,
    ADMIN_EDIT_OVERVIEW,
    ADMIN_EDIT_TEXT,
    ADMIN_EDIT_TYPE,
    ADMIN_PUBLISH_CARD,
    ADMIN_VIDEO_TYPE,
    REEL_REVIEW_CANCEL,
    REEL_REVIEW_CONFIRM_HOOK,
    REEL_REVIEW_CUSTOM_HOOK,
    REEL_REVIEW_EDIT_HOOK,
    REEL_REVIEW_FRAGMENT_PAGE,
    REEL_REVIEW_HOOK_BACK,
    REEL_REVIEW_REGEN_HOOKS,
    REEL_REVIEW_HOOKS,
    REEL_REVIEW_PICK_FRAGMENT,
    REEL_REVIEW_PICK_HOOK,
    REEL_REVIEW_REBUILD
} from "#server/bot/callbacks/routes";
import {
    handleCustomHookText,
    reelReviewCancel,
    reelReviewConfirmHook,
    reelReviewCustomHook,
    reelReviewEditHook,
    reelReviewFragmentPage,
    reelReviewHookBack,
    reelReviewRegenHooks,
    reelReviewGenerateHooks,
    reelReviewPickFragment,
    reelReviewPickHook,
    reelReviewRebuild
} from "#server/bot/actions/admin/reelReview/reelReviewActions";

// Кнопки админа показывает только chosenCard, но callback_data можно подделать, а в webhook
// мог прийти любой update. Поэтому право проверяем в самом обработчике.
const adminOnly = (handler: (ctx: any) => unknown) =>
    async (ctx: any) => {
        if (!isAdmin(Number(ctx.from?.id))) {
            console.warn('[ADMIN ACTION DENIED]', {
                userId: ctx.from?.id ?? null,
                data: String(ctx.callbackQuery?.data ?? '').slice(0, 60)
            })

            try {
                await ctx.answerCbQuery()
            } catch {
                // Callback мог устареть — ответ необязателен.
            }
            return
        }

        return handler(ctx)
    }

export const registerAdminActions = (bot: Telegraf) => {
    bot.action(ADMIN_EDIT_CARD.pattern, adminOnly(editAdminInlineMedia))
    bot.action(ADMIN_PUBLISH_CARD.pattern, adminOnly(publishAdminInlineMedia))
    bot.action(ADMIN_DOWNLOAD_TRAILER.pattern, adminOnly(adminDownloadTrailer))
    bot.action(ADMIN_CHANGE_TRAILER_KEY.pattern, adminOnly(adminAddTrailerKey))
    bot.action(ADMIN_EDIT_MEDIA.pattern, adminOnly(adminEditMedia))
    bot.action(ADMIN_EDIT_TEXT.pattern, adminOnly(adminEditText))
    bot.action(ADMIN_EDIT_OVERVIEW.pattern, adminOnly(adminEditOverview))
    bot.action(ADMIN_EDIT_TYPE.pattern, adminOnly(adminEditTypeCard))
    bot.action(ADMIN_VIDEO_TYPE.pattern, adminOnly(adminChooseVideoType))

    // Проверка Reel перед публикацией: «Пересобрать», «Сгенерировать хук», «1»–«4», «Отменить».
    bot.action(REEL_REVIEW_REBUILD.pattern, adminOnly(reelReviewRebuild))
    bot.action(REEL_REVIEW_HOOKS.pattern, adminOnly(reelReviewGenerateHooks))
    bot.action(REEL_REVIEW_PICK_HOOK.pattern, adminOnly(reelReviewPickHook))
    bot.action(REEL_REVIEW_CANCEL.pattern, adminOnly(reelReviewCancel))
    bot.action(REEL_REVIEW_PICK_FRAGMENT.pattern, adminOnly(reelReviewPickFragment))
    bot.action(REEL_REVIEW_FRAGMENT_PAGE.pattern, adminOnly(reelReviewFragmentPage))
    bot.action(REEL_REVIEW_REGEN_HOOKS.pattern, adminOnly(reelReviewRegenHooks))
    bot.action(REEL_REVIEW_CUSTOM_HOOK.pattern, adminOnly(reelReviewCustomHook))
    bot.action(REEL_REVIEW_HOOK_BACK.pattern, adminOnly(reelReviewHookBack))
    bot.action(REEL_REVIEW_CONFIRM_HOOK.pattern, adminOnly(reelReviewConfirmHook))
    bot.action(REEL_REVIEW_EDIT_HOOK.pattern, adminOnly(reelReviewEditHook))

    bot.on('message', async (ctx: any, next) => {

        // Сессии редактирования бывают только у админа — остальным лишний запрос не нужен.
        if (!isAdmin(Number(ctx.from?.id))) {
            return next()
        }

        // «✍️ Свой вариант» хука: если задача ждёт текст, сообщение становится хуком.
        if (await handleCustomHookText(ctx)) {
            return
        }

        const session =
           await getAdminEditSession(ctx.from.id)

        if (!session?.mode) {
            return next()
        }

        return adminEditActionInlineMessage(ctx, session)
    })
}
