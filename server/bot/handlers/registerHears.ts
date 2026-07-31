import {replyKey} from "#server/bot/consts/buttons/replyKeyboard";
import {openInlineSearch} from "#server/bot/actions/admin/helpers/openInlineSearch";
import {menuBot} from "#server/bot/handlers/commands/start/menuBot";

export const registerHears = (bot: any) => {
    bot.hears(replyKey.MENU, menuBot)

    bot.hears(replyKey.RANDOM, async (ctx: any) => {
        await ctx.reply(
            "Показываю новинки..."
        )
    })

    bot.hears(replyKey.COLLECTION, async (ctx: any) => {
        await openInlineSearch(ctx, '#collection', 'Нажмите кнопку ниже чтобы продолжить с места где остановились')
    })
}
