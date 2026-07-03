import {Telegraf} from "telegraf";
import {nameMediaSearch} from "#server/bot/actions/addMedia/nameMediaSearch";

export function registerHandlers(bot: Telegraf) {
    bot.on('text', nameMediaSearch)
}
