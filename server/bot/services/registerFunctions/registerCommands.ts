import {Telegraf} from "telegraf";
import {menuBot} from "#server/bot/handlers/commands/start/menuBot";
import {start} from "#server/bot/commands/start";
import {help} from "#server/bot/commands/help";
import {addMessageSession} from "#server/bot/services/session/addMessageSession";
import {clear} from "#server/bot/commands/clear";
import {SessionMessageType} from "#server/bot/consts/types/SessionMessageTypes";

const authRequests = new Map()

export function registerCommands(bot:Telegraf) {
    bot.start(async (ctx: any) => {

        const message = ctx.message.message_id

        await start(ctx, authRequests)

        await addMessageSession(
            ctx.from.id,
            message,
            SessionMessageType.Command
        )
    })
    bot.command('help', help)
    bot.command('clear', clear)
    bot.action('menu_bot', menuBot)
}
