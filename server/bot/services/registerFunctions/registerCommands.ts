import {Telegraf} from "telegraf";
import {menuBot} from "#server/bot/handlers/commands/start/menuBot";
import {commandStart} from "#server/bot/commands/commandStart";
import {commandHelp} from "#server/bot/commands/commandHelp";
import {addMessageSession} from "#server/bot/services/session/addMessageSession";
import {commandClear} from "#server/bot/commands/commandClear";
import {SessionMessageType} from "#server/bot/consts/types/SessionMessageTypes";

const authRequests = new Map()

export function registerCommands(bot:Telegraf) {
    bot.start(async (ctx: any) => {

        console.log('ctx button', ctx)

        const message = ctx.message.message_id

        await commandStart(ctx, authRequests)

        await addMessageSession(
            ctx.from.id,
            SessionMessageType.Command, {
                messageId: message
            }
        )
    })
    bot.command('help', commandHelp)
    bot.command('clear', commandClear)
    bot.action('menu_bot', menuBot)
}
