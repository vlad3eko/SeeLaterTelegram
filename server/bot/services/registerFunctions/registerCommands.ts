import {Telegraf} from "telegraf";
import {menuBot} from "#server/bot/handlers/commands/start/menuBot";
import {commandStart} from "#server/bot/commands/commandStart";
import {commandHelp} from "#server/bot/commands/commandHelp";
import {addMessageSession} from "#server/bot/services/session/addMessageSession";
import {commandClear} from "#server/bot/commands/commandClear";
import {SessionMessageType} from "#server/bot/consts/types/SessionMessageTypes";
import {getLastSearchQuery} from "~/utils/search/repository/tmdbRepository";
import {keyboardSearchBot} from "#server/bot/consts/buttons/keyboardBot";
import {processTelegramAuth} from "#server/bot/services/auth/processTelegramAuth";
import {isSubscriber} from "#server/bot/handlers/channel/isSubscriber";

const authRequests = new Map()

export function registerCommands(bot: Telegraf) {
    bot.start(async (ctx: any) => {

        if (ctx.text.includes('inline_settings')) {

            const messageStart = ctx.message.message_id
            await addMessageSession(
                ctx.from.id,
                SessionMessageType.Command, {
                    messageId: messageStart
                }
            )

            const checkSub = await isSubscriber(ctx)
            if (!checkSub) return

            const tagGet = (await getLastSearchQuery(ctx.from.id))
                .map(tag => `#${tag}`)
                .join(' ')


            console.log('tagQuery', tagGet)
            const messageContinue = await ctx.reply({
                    reply_markup: keyboardSearchBot('Продолжить искать', undefined, tagGet)
                }
            )

            await addMessageSession(
                ctx.from.id,
                SessionMessageType.SearchInline, {
                    messageId: messageContinue
                }
            )

            return
        }


        const message = ctx.message.message_id
        if (!message) return

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
