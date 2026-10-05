import type {queryCTX, queryRichCard} from "#server/global/engine/card/enum/types"
import {constructRichListCard} from "#server/global/engine/card/construct/constructRichListCard"
import {tryGenerateCard} from "#server/global/engine/card/construct/tryGenerateCard"
import {sendRichMessage} from "#server/global/engine/card/transport/sendRichMessage"
import {normalizeRichContext} from "#server/global/engine/card/construct/normalizeRichContext"

export const engineRichListCard = async (
    ctx: queryCTX | any | undefined,
    queries: queryRichCard[]
) => {

    const richCtx =
        normalizeRichContext(ctx)

    if (!richCtx) return
    if (!queries.length) return

    const {caption, keyboard} =
        await constructRichListCard(richCtx, queries)

    /*
     * inline message
     */
    if (richCtx.inlineMessageId) {

        return tryGenerateCard(
            richCtx,
            caption,
            keyboard
        )
    }

    /*
     * обычный Telegram message
     */
    return sendRichMessage(
        richCtx.ctx,
        caption,
        keyboard
    )
}
