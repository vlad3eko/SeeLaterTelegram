import {processTelegramAuth} from "#server/bot/services/auth/processTelegramAuth";
import {failedLoginToken} from "#server/bot/handlers/commands/start/failedLoginToken";

export const start = async (ctx: any, authRequests: Map<string, number>) => {

    const loginToken = ctx.payload

    if (loginToken) {
        authRequests.set(ctx.from.id, loginToken)
        await processTelegramAuth(ctx, authRequests, true)
    }
    await processTelegramAuth(ctx, authRequests, false)

    await failedLoginToken(ctx)
    await ctx.deleteMessage()
}
