import {Telegraf} from 'telegraf'
import {registerActions} from "#server/bot/actions";
import {registerCommands} from "#server/bot/commands";
import {registerHandlers} from "#server/bot/handlers";

export const bot = new Telegraf(process.env.TELEGRAM_TOKEN!)

registerCommands(bot)
registerActions(bot)
registerHandlers(bot)

await bot.telegram.setMyCommands([
    { command: 'start', description: 'Главное меню' },
    { command: 'help', description: 'Помощь' },
])
