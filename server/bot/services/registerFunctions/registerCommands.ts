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

const authRequests = new Map()

export function registerCommands(bot: Telegraf) {
    bot.start(async (ctx: any) => {

        if (ctx.text.includes('inline_settings')) {

            await processTelegramAuth(ctx)

            const tagGet = (await getLastSearchQuery(ctx.from.id))
                .map(tag => `#${tag}`)
                .join(' ')


            console.log('tagQuery', tagGet)
            const message = await ctx.reply(
                `Привет ${ctx.from.first_name || ctx.from.username}

🔍 Для поиска используй кнопки ниже или отправь в сообщении название кино\n
Связь: https://t.me/kinomanovnet?direct`,
                {
                    reply_markup: keyboardSearchBot(),
                    link_preview_options: {
                        is_disabled: true
                    }
                },
            )

            await addMessageSession(
                ctx.from.id,
                SessionMessageType.Command, {
                    messageId: message
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
