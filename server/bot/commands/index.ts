import {Telegraf} from "telegraf";
import {menuBot} from "#server/bot/handlers/commands/start/menuBot";
import {start} from "#server/bot/commands/start";
import {help} from "#server/bot/commands/help";
import {addSessionMessage} from "#server/bot/services/session/addSessionMessage";
import {clear} from "#server/bot/commands/clear";

const authRequests = new Map()

export function registerCommands(bot:Telegraf) {
    bot.start(async (ctx) => {

        const message = ctx.message.message_id

        await start(ctx, authRequests)

        await addSessionMessage(
            ctx.from.id,
            message
        )
    })
    bot.command('help', help)
    bot.command('clear', clear)
    bot.action('menu_bot', menuBot)
}
