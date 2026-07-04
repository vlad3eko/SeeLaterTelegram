import {Telegraf} from "telegraf";
import {nameMediaSearch} from "#server/bot/actions/media/nameMediaSearch";
import {addSessionMessage} from "#server/bot/services/session/addSessionMessage";

export function registerHandlers(bot: Telegraf) {
    bot.on('text', async (ctx) => {

        await addSessionMessage(
            ctx.from.id,
            ctx.message.message_id
        );

        await nameMediaSearch(ctx)
    })

}
