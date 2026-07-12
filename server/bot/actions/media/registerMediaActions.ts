import {Telegraf} from "telegraf";
import {saveMedia} from "#server/bot/actions/media/saveMedia";
import {deleteMedia} from "#server/bot/actions/media/deleteMedia";

export function registerMediaActions(bot: Telegraf) {
    bot.action(/^save_media_(\d+)_(movie|tv)$/, saveMedia)
    bot.action(/^delete_media_(\d+)_(movie|tv)$/, deleteMedia)
    bot.action(/^favorites_media_(\d+)$/, favoritesMedia)
}
