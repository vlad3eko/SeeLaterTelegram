import {Telegraf} from "telegraf"
import {nameMediaSearch} from "#server/bot/actions/media/nameMediaSearch"
import {addMessageSession} from "#server/bot/services/session/addMessageSession"
import {searchMediaInline} from "#server/bot/handlers/media/searchMediaInline"
import {openInlineMovie} from "#server/bot/handlers/media/openInlineMovie"
import {addMediaState} from "#server/bot/consts/media/addMediaState"
import {deleteMessages} from "#server/bot/actions/delete/deleteMessages"
import {Markup} from "telegraf"

export function registerHandlers(bot: Telegraf) {
    bot.on("text", async (ctx) => {

        const text = ctx.message.text
        const state = addMediaState.get(ctx.from.id)

        if (text.startsWith("media_")) {
            await openInlineMovie(ctx)
            return
        }

        if (!state?.waitingMovie) {

            await ctx.deleteMessage()

            const message = await ctx.reply(
                `🔍 Искать фильм «${text}» через быстрый поиск?`,
                Markup.inlineKeyboard([
                    [
                        Markup.button.switchToCurrentChat(
                            `🔍 Искать «${text}»`,
                            text
                        )
                    ]
                ])
            )

            await addMessageSession(ctx.from.id, message.message_id)
            return
        }

        await addMessageSession(ctx.from.id, ctx.message.message_id)
        await nameMediaSearch(ctx)

    })

    bot.on('inline_query', searchMediaInline)
}
