
import {tryGenerateCard} from "#server/global/engine/card/construct/tryGenerateCard";
import {resolveCardStrategies} from "#server/global/engine/card/strategy/resolveCardStrategies";
import type {queryCTX, queryRichCard} from "#server/global/engine/card/enum/types";

export const resolveRichCard = async (
    ctx: queryCTX | undefined,
    query: queryRichCard
) => {
    const strategy = resolveCardStrategies[query.type]
    const data = await strategy.resolve(query)
    const enrichData = await strategy.enrich(ctx, query, data)

    return {
        caption: strategy.caption(query, enrichData),
        keyboard: strategy.keyboard(ctx, query, enrichData)
    }
}

export const engineRichCard = async (
    ctx: queryCTX | undefined,
    query: queryRichCard
) => {
    const {caption, keyboard} =
        await resolveRichCard(ctx, query)

    return tryGenerateCard(ctx, caption, keyboard)
}
