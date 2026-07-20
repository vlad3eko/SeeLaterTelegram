import {Telegraf} from "telegraf";
import {processTelegramAuth} from "#server/bot/services/auth/processTelegramAuth";

export function registerAuthAction(bot: Telegraf) {
    bot.action('check_sub', async (ctx) => {
        await processTelegramAuth(ctx)
    })
}
