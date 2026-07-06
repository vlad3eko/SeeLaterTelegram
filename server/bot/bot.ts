import {registerActions} from "#server/bot/services/registerFunctions/registerActions";
import {registerCommands} from "#server/bot/services/registerFunctions/registerCommands";
import {registerHandlers} from "#server/bot/services/registerFunctions/registerHandlers";
import {Telegraf} from "telegraf";

export const bot = new Telegraf(process.env.TELEGRAM_TOKEN!)

registerCommands(bot)
registerActions(bot)
registerHandlers(bot)


