import {queryCTX, queryRichCard, RichCardMode} from "#server/global/engine/card/enum/types"
import {resolveCardStrategies} from "#server/global/engine/card/strategy/resolveCardStrategies"

export const resolveRichItem = async (
    ctx: queryCTX | undefined,
    query: queryRichCard,
    mode: RichCardMode = 'item'
) => {

    const strategy = resolveCardStrategies[query.type]

    if (!strategy)
        throw new Error(`[resolveRichItem] Strategy not found: ${query.type}`)

    const data = await strategy.resolve(query)
    const enrichData = await strategy.enrich(ctx, query, data, mode)

    return {
        query,
        strategy,
        data: enrichData
    }
}
