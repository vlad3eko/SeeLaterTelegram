import type {queryCTX, queryRichCard} from "#server/global/engine/card/enum/types"
import {constructRichCard} from "#server/global/engine/card/construct/constructRichCard"
import {tryGenerateCard} from "#server/global/engine/card/construct/tryGenerateCard"
import {sendRichMessage} from "#server/global/engine/card/transport/sendRichMessage"
import {normalizeRichContext} from "#server/global/engine/card/construct/normalizeRichContext"

export const engineRichCard = async (
    ctx: queryCTX | any | undefined,
    query: queryRichCard,
    options: {footerRows?: any[][]} = {}
) => {

    const richCtx = normalizeRichContext(ctx)
    if (!richCtx) return

    const {caption, keyboard} =
        await constructRichCard(richCtx, query)

    // Доп. ряды снизу (подборки /g: «К подборке»).
    if (options.footerRows?.length && keyboard?.inline_keyboard) {
        keyboard.inline_keyboard.push(...options.footerRows)
    }

    const canEditMessage =
        Boolean(richCtx.inlineMessageId)
        || (richCtx.chatId !== undefined && richCtx.messageId !== undefined)

    if (canEditMessage) {
        return tryGenerateCard(richCtx, caption, keyboard)
    }

    return sendRichMessage(richCtx.ctx, caption, keyboard)
}
