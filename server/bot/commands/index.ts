import {Telegraf} from "telegraf";
import {menuBot} from "#server/bot/handlers/commands/start/menuBot";
import {start} from "#server/bot/commands/start";
import {help} from "#server/bot/commands/help";

const authRequests = new Map()

export function registerCommands(bot:Telegraf) {

    bot.start(async (ctx) => {
        await start(ctx, authRequests)
    })

    bot.command('help', help)
    bot.action('menu_bot', menuBot)
}
