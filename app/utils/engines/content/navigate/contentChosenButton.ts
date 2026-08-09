import {ContentTelegramMenu} from "~/utils/engines/content/strategy/enums";
import {
    bestByAttributeKeyboard,
    mostWaitingKeyboard,
    releasesKeyboard,
    startContentKeyboard
} from "#server/bot/consts/buttons/admin/contentEngine/keyboardRepository";

export const contentChosenButton = async (ctx: any) => {
    const type = ctx.match[1] as ContentTelegramMenu
    const userId = ctx.from.id

    const messageId =
        ctx.callbackQuery.message.message_id

    if (!messageId) {
        await ctx.answerCbQuery()
        return
    }

    try {
        switch (type) {
            case ContentTelegramMenu.START:
                await ctx.editMessageReplyMarkup(startContentKeyboard(userId))
                break

            case ContentTelegramMenu.RELEASE:
                await ctx.editMessageReplyMarkup(releasesKeyboard(userId))
                break

            case ContentTelegramMenu.WAITING:
                await ctx.editMessageReplyMarkup(mostWaitingKeyboard(userId))
                break

            case ContentTelegramMenu.BEST:
                await ctx.editMessageReplyMarkup(bestByAttributeKeyboard(userId))
                break

            default:
                return
        }

    } catch (e: any) {
        console.log('ERROR [contentChosenButton]: ', e.message)
    }
}
