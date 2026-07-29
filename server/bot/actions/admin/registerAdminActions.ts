import {publishAdminInlineMedia} from "#server/bot/actions/admin/publishAdminInlineMedia";
import {editAdminInlineMedia} from "#server/bot/actions/admin/editAdminInlineMedia";
import {adminEditMedia} from "#server/bot/actions/admin/adminEditMedia";
import {adminEditText} from "#server/bot/actions/admin/adminEditText";
import {getAdminEditSession} from "#server/bot/actions/admin/adminEditSession";
import {adminEditActionInlineMessage} from "#server/bot/actions/admin/adminEditActionInlineMessage";
import {Telegraf} from "telegraf";
import {adminEditOverview} from "#server/bot/actions/admin/adminEditOverview";

export const registerAdminActions = (bot: Telegraf) => {
    bot.action(/^edit_media_(\d+)_(movie|tv)_(.+)$/, editAdminInlineMedia)
    bot.action(/^publish_media_(\d+)_(movie|tv)$/, publishAdminInlineMedia)
    bot.action(/^admin_edit_media$/, adminEditMedia)
    bot.action(/^admin_edit_text$/, adminEditText)
    bot.action(/^admin_edit_overview$/, adminEditOverview)
    bot.on('message', async (ctx: any, next) => {

        const session =
            getAdminEditSession(ctx.from.id)

        if (!session?.mode) {
            return next()
        }

        return adminEditActionInlineMessage(
            ctx,
            session
        )
    })
}
