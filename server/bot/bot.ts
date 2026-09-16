
import {Telegraf} from "telegraf";
import {registerCommands} from "#server/bot/services/registerFunctions/registerCommands";
import {registerActions} from "#server/bot/services/registerFunctions/registerActions";
import {registerHandlers} from "#server/bot/services/registerFunctions/registerHandlers";
import {
    TELEGRAM_CHANEL_LINK, TELEGRAM_DEV_CHANEL_LINK,
} from "#server/global/oneLinkApp";

const isDevelopment =
    process.env.NODE_ENV === 'development'

export const BOT_LINK =
    isDevelopment
        ? process.env.TELEGRAM_DEV_TOKEN
        : process.env.TELEGRAM_TOKEN

export const CHANEL_LINK =
    isDevelopment
        ? TELEGRAM_DEV_CHANEL_LINK
        : TELEGRAM_CHANEL_LINK

export const bot = new Telegraf(BOT_LINK!)

registerActions(bot)
registerCommands(bot)
registerHandlers(bot)

if (isDevelopment) {

    bot.launch().catch(console.error)
    console.log('[BOT START DEVELOPMENT]')
}
