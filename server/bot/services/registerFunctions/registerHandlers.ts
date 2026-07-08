import {Telegraf} from "telegraf"
import {nameMediaSearch} from "#server/bot/actions/media/nameMediaSearch"
import {addMessageSession} from "#server/bot/services/session/addMessageSession"
import {searchMediaInline} from "#server/bot/handlers/media/searchMediaInline"
import {openInlineMovie} from "#server/bot/handlers/media/openInlineMovie"
import {addMediaState} from "#server/bot/consts/media/addMediaState"
import {SessionMessageType} from "#server/bot/consts/types/SessionMessageTypes";
import {keyboardSearchBot} from "#server/bot/consts/buttons/keyboardBot";
import {deleteMessages} from "#server/bot/actions/delete/deleteMessages";

export function registerHandlers(bot: Telegraf) {
    bot.on("text", async (ctx) => {

        const text = ctx.message.text
        const textId = ctx.message.message_id
        const state = addMediaState.get(ctx.from.id)

        if (text.startsWith('/')) return

        if (text.startsWith("media_")) {
            await openInlineMovie(ctx)
            await addMessageSession(ctx.from.id, ctx.message.message_id , SessionMessageType.SearchInline)
            return
        }

        if (!state?.waitingMovie) {


            await addMessageSession(ctx.from.id, textId, SessionMessageType.SearchInline)
            const message = await ctx.reply(
                `🔍 Искать фильм «${text}» через быстрый поиск?`, {
                    reply_markup: keyboardSearchBot('Искать', text, text)
                }
            )
            await addMessageSession(ctx.from.id, message.message_id, SessionMessageType.SearchInline)
            return
        }

        await addMessageSession(ctx.from.id, ctx.message.message_id, SessionMessageType.Text)
        await nameMediaSearch(ctx)

    })

    bot.on('inline_query', searchMediaInline)
}
