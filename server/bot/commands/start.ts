import {processTelegramAuth} from "#server/bot/services/auth/processTelegramAuth";
import {checkChannelSubscriber} from "#server/bot/handlers/auth/check/checkChannelSubscriber";
import {failedChannelSubscriber} from "#server/bot/handlers/auth/fail/failedChannelSubscriber";

export const start = async (ctx: any, authRequests: Map<string, number>) => {

    const loginToken = ctx.payload

    if (loginToken)
        authRequests.set(ctx.from.id, loginToken)

    await processTelegramAuth(ctx, authRequests, false)
}
