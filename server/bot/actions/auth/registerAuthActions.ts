
import {Telegraf} from "telegraf";
import {processTelegramAuth} from "#server/bot/services/auth/processTelegramAuth";
import {CHECK_SUBSCRIPTION} from "#server/bot/callbacks/routes";

export function registerAuthAction(bot: Telegraf) {
    bot.action(CHECK_SUBSCRIPTION.pattern, async (ctx) => {
        await processTelegramAuth(ctx)
    })
}
