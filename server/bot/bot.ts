import {registerActions} from "#server/bot/services/registerFunctions/registerActions";
import {registerCommands} from "#server/bot/services/registerFunctions/registerCommands";
import {registerHandlers} from "#server/bot/services/registerFunctions/registerHandlers";
import {Telegraf} from "telegraf";

const isDevelopment =
    process.env.NODE_ENV === 'development'

const token =
    isDevelopment
        ? process.env.TELEGRAM_DEV_TOKEN
        : process.env.TELEGRAM_TOKEN

export const bot = new Telegraf(token!)

registerActions(bot)
registerCommands(bot)
registerHandlers(bot)

if (isDevelopment) {

    bot.launch()


    console.log('[BOT START DEVELOPMENT]')
}
