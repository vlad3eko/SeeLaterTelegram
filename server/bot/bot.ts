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

export const URL_ACTIVE =
    isDevelopment
        ? 'http://127.0.0.1:3000'
        : 'https://kinomanov.net'

/** Update, которые бот получает; тот же список — в scripts/setTelegramWebhook.mjs. */
export const BOT_ALLOWED_UPDATES = [
    'message', 'edited_message', 'channel_post', 'edited_channel_post', 'inline_query', 'chosen_inline_result',
    'callback_query', 'my_chat_member', 'chat_member', 'chat_join_request'
]

export const bot = new Telegraf(BOT_LINK!, {
    handlerTimeout: 5 * 60 * 1000
})

registerActions(bot)
registerCommands(bot)
registerHandlers(bot)

if (isDevelopment) {

    // chat_member Telegram шлёт только если он назван явно (как allowed_updates вебхука).
    bot.launch({allowedUpdates: BOT_ALLOWED_UPDATES as any}).catch(console.error)
    console.log('[BOT START DEVELOPMENT]')
}
