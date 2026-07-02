import {processTelegramAuth} from "#server/bot/services/auth/processTelegramAuth";

export const start = async (ctx: any, authRequests: Map<string, number>) => {

    const loginToken = ctx.payload

    if (loginToken) {
        authRequests.set(ctx.from.id, loginToken)
        await processTelegramAuth(ctx, authRequests, true)
    }
    await processTelegramAuth(ctx, authRequests)
}
