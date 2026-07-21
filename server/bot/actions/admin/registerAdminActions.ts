import {Telegraf} from "telegraf";
import {editAdminInlineMedia} from "#server/bot/actions/admin/editAdminInlineMedia";
import {publishAdminInlineMedia} from "#server/bot/actions/admin/publishAdminInlineMedia";
import {adminEditText} from "#server/bot/actions/admin/adminEditText";
import {adminEditMedia} from "#server/bot/actions/admin/adminEditMedia";
import {adminEditActionInlineMessage} from "#server/bot/actions/admin/adminEditActionInlineMessage";

export const registerAdminActions = (bot: Telegraf) => {
    bot.action(/^edit_media_(\d+)_(movie|tv)_(.+)$/, editAdminInlineMedia)
    bot.action(/^publish_media_(\d+)_(movie|tv)$/, publishAdminInlineMedia)
    bot.action("admin_edit_media", adminEditMedia)
    bot.action("admin_edit_text", adminEditText)
    bot.on('message', adminEditActionInlineMessage)
}
