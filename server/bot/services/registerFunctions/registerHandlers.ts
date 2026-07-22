import {Telegraf} from "telegraf"
import {addMessageSession} from "#server/bot/services/session/addMessageSession"
import {searchMediaInline} from "#server/bot/handlers/media/searchMediaInline"
import {SessionMessageType} from "#server/bot/consts/types/SessionMessageTypes";
import {keyboardSearchBot} from "#server/bot/consts/buttons/keyboardBot";
import {chosenInlineMedia} from "#server/bot/handlers/media/chosenInlineMedia";
import {getAdminEditSession} from "#server/bot/actions/admin/adminEditSession";

export function registerHandlers(bot: Telegraf) {
    bot.on("text", async (ctx) => {

        const session =
            getAdminEditSession(ctx.from.id)

        if (session?.mode) {
            return
        }

        const text = ctx.message.text
        const textId = ctx.message.message_id

        if (text.startsWith('/')) return
        if (text.startsWith('bot: ')) return chosenInlineMedia(ctx)
        if ((text.startsWith('Ищите популярные'))) return

        await addMessageSession(ctx.from.id, SessionMessageType.SearchInline, {messageId: textId})
        const message = await ctx.reply(
            `🔍 Искать фильм «${text}» через быстрый поиск?`, {
                reply_markup: keyboardSearchBot('Искать', text)
            }
        )
        await addMessageSession(ctx.from.id, SessionMessageType.SearchInline, {messageId: message.message_id})
    })

    bot.on('inline_query', searchMediaInline)
    bot.on('chosen_inline_result', chosenInlineMedia)
}
