import type {queryCTX, queryRichCard} from "#server/global/engine/card/enum/types"
import {resolveRichItem} from "#server/global/engine/card/resolve/resolveRichItem"
import {createRichListCaption} from "#server/global/engine/card/variant/createRichListCaption"
import {createRichListKeyboard} from "#server/global/engine/card/construct/createRichListKeyboard"

export const constructRichListCard = async (
    ctx: queryCTX | undefined,
    queries: queryRichCard[]
) => {

    const items =
        await Promise.all(queries
                .map(query => resolveRichItem(ctx, query, 'list')))

    return {
        items,
        caption: createRichListCaption(items),
        keyboard: createRichListKeyboard(items)
    }
}
