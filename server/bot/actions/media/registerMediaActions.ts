
import {Telegraf} from "telegraf";
import {saveMedia} from "#server/bot/actions/media/saveMedia";
import {deleteMedia} from "#server/bot/actions/media/deleteMedia";
import {CARD_MORE, DELETE_MEDIA, SAVE_MEDIA} from "#server/bot/callbacks/routes";
import {cardMore} from "#server/bot/actions/media/cardMore";

export function registerMediaActions(bot: Telegraf) {
    bot.action(SAVE_MEDIA.pattern, saveMedia)
    bot.action(DELETE_MEDIA.pattern, deleteMedia)
    bot.action(CARD_MORE.pattern, cardMore)
}
