
import {Telegraf} from "telegraf"
import {addMessageSession} from "#server/bot/services/session/addMessageSession"
import {SessionMessageType} from "#server/bot/consts/types/SessionMessageTypes";
import {keyboardSearchBot} from "#server/bot/consts/buttons/keyboardBot";
import {getAdminEditSession} from "#server/bot/actions/admin/adminEditSession";
import {registerHears} from "#server/bot/handlers/registerHears";
import {searchMediaInline} from "#server/global/module/telegram/search/process/searchMediaInline";
import {chosenCard} from "#server/global/module/telegram/search/process/chosenCard";
import {onChannelMember} from "#server/bot/handlers/channel/onChannelMember";

export function registerHandlers(bot: Telegraf) {

    registerHears(bot)

    bot.on("text", async (ctx) => {

        const session =
           await getAdminEditSession(ctx.from.id)

        if (session?.mode)
            return

        const text = ctx.message.text
        const textId = ctx.message.message_id

        if (text.startsWith('/')) return
        if (text.startsWith('bot:')) return chosenCard(ctx)
        if ((text.startsWith('message: '))) return

        await addMessageSession(ctx.from.id, SessionMessageType.SearchInline, {messageId: textId})
        const message = await ctx.reply(
            `🔍 Искать фильм «${text}» через быстрый поиск?`, {
                reply_markup: keyboardSearchBot('Искать', text)
            }
        )
        await addMessageSession(ctx.from.id, SessionMessageType.SearchInline, {messageId: message.message_id})
    })

    bot.on('inline_query', searchMediaInline)
    bot.on('chosen_inline_result', chosenCard)
    // Подписка/отписка в обязательных каналах: автопродолжение без «Проверить подписку».
    bot.on('chat_member', (ctx) => onChannelMember(ctx).catch(error => console.error('[CHANNEL MEMBER]', error?.message ?? error)))

}
