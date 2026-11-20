import {CARD_MORE} from "#server/bot/callbacks/routes";
import {isAdmin} from "#server/bot/consts/admins";
import {cardMoreRows, keyboardSendMediaCardInline} from "#server/bot/consts/buttons/keyboardBot";

/**
 * «⋯ Ещё»: на месте кнопки появляются «Актёры | Поиск» и «Удалить». У сообщения в чате
 * меняется только этот ряд (остальные — «◀️ К похожим», кнопки администратора — на месте);
 * у inline-сообщения клавиатуры в запросе нет, её собирают заново.
 */
export const cardMore = async (ctx: any) => {
    const {mediaId, mediaType, contentType, keyTrailer} = CARD_MORE.parse(ctx)
    const rows = ctx.callbackQuery?.message?.reply_markup?.inline_keyboard as any[][] | undefined
    const data = ctx.callbackQuery?.data

    const markup = rows
        ? {
            inline_keyboard: rows.flatMap(row => row.some(button => button.callback_data === data)
                ? cardMoreRows(mediaId, mediaType, contentType)
                : [row])
        }
        : keyboardSendMediaCardInline(mediaId, mediaType, contentType, isAdmin(ctx.from?.id), 'inline', 0, keyTrailer, false, true)

    await ctx.answerCbQuery().catch(() => undefined)
    await ctx.editMessageReplyMarkup(markup).catch((error: any) => {
        console.warn('[CARD MORE] Keyboard edit failed', error?.response?.description ?? error?.message)
    })
}
