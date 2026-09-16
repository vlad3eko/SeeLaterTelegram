import {Telegraf} from "telegraf";
import {deleteMessages} from "#server/bot/actions/delete/deleteMessages";

export function registerDeleteActions(bot: Telegraf) {
    bot.action(/^back_(\d+)$/, async (ctx) => {
        await deleteMessages(ctx, [0, 1])
    })

    bot.action(/^delete_all_(\d+)$/, async (ctx) => {
        const count = Number(ctx.match[1] ?? 0)
        const offsets = Array.from({ length: count }, (_, i) => -i)
        await deleteMessages(ctx, offsets)
    })
}
