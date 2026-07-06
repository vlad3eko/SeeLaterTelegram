import {Telegraf} from "telegraf";
import {nameMediaSearch} from "#server/bot/actions/media/nameMediaSearch";
import {addMessageSession} from "#server/bot/services/session/addMessageSession";
import {inlineSearchMedia} from "#server/bot/handlers/media/inlineSearchMedia";

export function registerHandlers(bot: Telegraf) {
    bot.on('text', async (ctx) => {

        await addMessageSession(
            ctx.from.id,
            ctx.message.message_id
        );

        await nameMediaSearch(ctx)
    })

    bot.on('inline_query', inlineSearchMedia)
}
