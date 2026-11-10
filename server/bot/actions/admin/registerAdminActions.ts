
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
    bot.action(/^edit_media_(\d+)_(movie|tv)_([^_]+)(?:_(.+))?$/, adminOnly(editAdminInlineMedia))
    bot.action(/^publish_media_(\d+)_(movie|tv)_([^_]+)(?:_(.+?))?(?:_(true|false))?$/, adminOnly(publishAdminInlineMedia))
    bot.action(/^download_trailer$/, adminOnly(adminDownloadTrailer))
    bot.action(/^update_trailer_key$/, adminOnly(adminAddTrailerKey))
    bot.action(/^admin_edit_media$/, adminOnly(adminEditMedia))
    bot.action(/^admin_edit_text$/, adminOnly(adminEditText))
    bot.action(/^admin_edit_overview$/, adminOnly(adminEditOverview))
    bot.action(/^admin_edit_type_card$/, adminOnly(adminEditTypeCard))

    bot.on('message', async (ctx: any, next) => {

        // Сессии редактирования бывают только у админа — остальным лишний запрос не нужен.
        if (!isAdmin(Number(ctx.from?.id))) {
            return next()
        }

        const session =
           await getAdminEditSession(ctx.from.id)

        if (!session?.mode) {
            return next()
        }

        return adminEditActionInlineMessage(ctx, session)
    })
}
