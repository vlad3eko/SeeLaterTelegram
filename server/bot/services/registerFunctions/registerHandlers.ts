import {Telegraf} from "telegraf";
import {nameMediaSearch} from "#server/bot/actions/media/nameMediaSearch";
import {addMessageSession} from "#server/bot/services/session/addMessageSession";
import {searchMediaInline} from "#server/bot/handlers/media/searchMediaInline";

export function registerHandlers(bot: Telegraf) {
    bot.on('text', async (ctx) => {

        await addMessageSession(
            ctx.from.id,
            ctx.message.message_id
        );

        await nameMediaSearch(ctx)
    })

    bot.on('inline_query', searchMediaInline)
}
