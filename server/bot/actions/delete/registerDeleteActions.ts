
import {Telegraf} from "telegraf";
import {deleteMessages} from "#server/bot/actions/delete/deleteMessages";
import {LEGACY_BACK, LEGACY_DELETE_ALL} from "#server/bot/callbacks/routes";

// Кнопок с этими данными в коде больше нет: обработчики оставлены для старых сообщений.
export function registerDeleteActions(bot: Telegraf) {
    bot.action(LEGACY_BACK.pattern, async (ctx) => {
        await deleteMessages(ctx, [0, 1])
    })

    bot.action(LEGACY_DELETE_ALL.pattern, async (ctx) => {
        const {count} = LEGACY_DELETE_ALL.parse(ctx)
        const offsets = Array.from({ length: count }, (_, i) => -i)
        await deleteMessages(ctx, offsets)
    })
}
