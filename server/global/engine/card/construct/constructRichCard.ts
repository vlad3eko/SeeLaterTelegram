import type {
    queryCTX,
    queryRichCard
} from "#server/global/engine/card/enum/types"

import {resolveRichItem} from "#server/global/engine/card/resolve/resolveRichItem"

export const constructRichCard = async (
    ctx: queryCTX | undefined,
    query: queryRichCard
) => {

    const resolved = await resolveRichItem(ctx, query, 'item')

    return {
        caption: resolved.strategy.caption(query, resolved.data),
        keyboard: resolved.strategy.keyboard(ctx, query, resolved.data)
    }
}
