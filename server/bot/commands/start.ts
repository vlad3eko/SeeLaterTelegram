import {failedLoginToken} from "#server/bot/handlers/commands/start/failedLoginToken";
import {processTelegramAuth} from "#server/bot/services/auth/processTelegramAuth";

export const start = async (ctx: any, authRequests: Map<string, number>) => {

    const loginToken = ctx.payload

    if (!loginToken) {
       return await failedLoginToken(ctx)
    }

    authRequests.set(ctx.from.id, loginToken)

    await processTelegramAuth(ctx, authRequests)
}
