
import {Telegraf} from "telegraf";
import {processTelegramAuth} from "#server/bot/services/auth/processTelegramAuth";
import {CHECK_SUBSCRIPTION} from "#server/bot/callbacks/routes";
import {isSubscribedToAll} from "#server/bot/handlers/channel/requiredChannels";
import {runPendingActions} from "#server/bot/handlers/channel/pendingActions";

export function registerAuthAction(bot: Telegraf) {
    // «Проверить подписку» — запасной путь, если update chat_member не дошёл: подписан на оба канала и есть
    // запомненные действия — выполняем их вместо главного меню.
    bot.action(CHECK_SUBSCRIPTION.pattern, async (ctx) => {
        if (await isSubscribedToAll(ctx.telegram, ctx.from.id)) {
            const done = await runPendingActions(ctx.from).catch(error => {
                console.error('[CHECK SUBSCRIPTION] отложенные действия', error?.message ?? error)
                return 0
            })
            if (done) {
                await ctx.deleteMessage().catch(() => undefined)
                await ctx.answerCbQuery('✅ Подписка подтверждена').catch(() => undefined)
                return
            }
        }
        await processTelegramAuth(ctx)
    })
}
