
import {Telegraf} from "telegraf";
import {saveMedia} from "#server/bot/actions/media/saveMedia";
import {deleteMedia} from "#server/bot/actions/media/deleteMedia";
import {DELETE_MEDIA, SAVE_MEDIA} from "#server/bot/callbacks/routes";

export function registerMediaActions(bot: Telegraf) {
    bot.action(SAVE_MEDIA.pattern, saveMedia)
    bot.action(DELETE_MEDIA.pattern, deleteMedia)
}
