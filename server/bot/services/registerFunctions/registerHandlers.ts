import {Telegraf} from "telegraf";
import {nameMediaSearch} from "#server/bot/actions/media/nameMediaSearch";
import {addMessageSession} from "#server/bot/services/session/addMessageSession";
import {searchMediaInline} from "#server/bot/handlers/media/searchMediaInline";
import {openInlineMovie} from "#server/bot/handlers/media/openInlineMovie";

export function registerHandlers(bot: Telegraf) {
    bot.on('text', async (ctx) => {

        const text = ctx.message.text
        console.log('text', text)
        console.log('ctx', ctx)

        if (text.startsWith('media_')) {
            await openInlineMovie(ctx)
            return
        }

        await addMessageSession(
            ctx.from.id,
            ctx.message.message_id
        );

        await nameMediaSearch(ctx)
    })

    bot.on('inline_query', searchMediaInline)
}
