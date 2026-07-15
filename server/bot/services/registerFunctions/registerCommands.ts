import {Telegraf} from "telegraf";
import {menuBot} from "#server/bot/handlers/commands/start/menuBot";
import {commandStart} from "#server/bot/commands/commandStart";
import {commandHelp} from "#server/bot/commands/commandHelp";
import {addMessageSession} from "#server/bot/services/session/addMessageSession";
import {commandClear} from "#server/bot/commands/commandClear";
import {SessionMessageType} from "#server/bot/consts/types/SessionMessageTypes";
import {getLastSearchQuery} from "~/utils/search/repository/tmdbRepository";

const authRequests = new Map()

export function registerCommands(bot:Telegraf) {
    bot.start(async (ctx: any) => {

        if (ctx.text.includes('inline_settings')) {
            const tagQuery = await getLastSearchQuery(ctx.from.id)
            console.log('tagQuery', tagQuery)
            await ctx.reply('Переход по настройке')
            return
        }


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
