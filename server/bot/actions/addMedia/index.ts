import {Telegraf} from "telegraf";
import {selectMedia} from "#server/bot/actions/addMedia/selectMedia";
import {saveMedia} from "#server/bot/actions/addMedia/saveMedia";
import {processMediaSearch} from "#server/bot/services/addMedia/processMediaSearch";

export function registerMediaActions(bot: Telegraf) {
    bot.action('search_media', processMediaSearch)
    bot.action(/^media_(\d+)_(movie|tv)$/, selectMedia)
    bot.action(/^save_(\d+)_(\d+)_(movie|tv)$/, saveMedia)
}
