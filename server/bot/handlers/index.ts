import {Telegraf} from "telegraf";
import {nameMediaSearch} from "#server/bot/actions/media/nameMediaSearch";

export function registerHandlers(bot: Telegraf) {
    bot.on('text', nameMediaSearch)
}
