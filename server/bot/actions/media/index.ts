import {Telegraf} from "telegraf";
import {selectMedia} from "#server/bot/actions/media/selectMedia";
import {saveMedia} from "#server/bot/actions/media/saveMedia";
import {processMediaSearch} from "#server/bot/services/addMedia/processMediaSearch";
import {deleteMedia} from "#server/bot/actions/media/deleteMedia";

export function registerMediaActions(bot: Telegraf) {
    bot.action('search_media', processMediaSearch)
    bot.action(/^media_(\d+)_(movie|tv)$/, selectMedia)
    bot.action(/^save_media_(\d+)_(\d+)_(movie|tv)$/, saveMedia)
    bot.action(/^delete_media_(\d+)$/, deleteMedia)
}
