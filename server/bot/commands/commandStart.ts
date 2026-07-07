import {processTelegramAuth} from "#server/bot/services/auth/processTelegramAuth";
import {confirmUserRequest} from "#server/bot/handlers/auth/success/confirmUserRequest";
import {saveTelegramUser} from "#server/bot/handlers/auth/success/saveTelegramUser";

export const commandStart = async (ctx: any, authRequests: Map<string, number>) => {

    const loginToken = ctx.payload
    await saveTelegramUser(ctx)

    if (loginToken) {
        authRequests.set(ctx.from.id, loginToken)
        await processTelegramAuth(ctx, true)
        await confirmUserRequest(ctx, loginToken)
        await ctx.deleteMessage()
    } else {
        await processTelegramAuth(ctx)
    }
}
