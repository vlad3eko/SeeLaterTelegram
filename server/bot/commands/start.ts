import {processTelegramAuth} from "#server/bot/services/auth/processTelegramAuth";
import {confirmUserRequest} from "#server/bot/handlers/auth/success/confirmUserRequest";
import {saveTelegramUser} from "#server/bot/handlers/auth/success/saveTelegramUser";

export const start = async (ctx: any, authRequests: Map<string, number>, startId?: number | undefined) => {

    const loginToken = ctx.payload
    await saveTelegramUser(ctx)

    if (loginToken) {
        authRequests.set(ctx.from.id, loginToken)
        await processTelegramAuth(ctx, true)
        await confirmUserRequest(ctx, loginToken)
    }

    await processTelegramAuth(ctx)
}
