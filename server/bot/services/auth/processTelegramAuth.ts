import {saveTelegramUser} from "#server/bot/handlers/auth/success/saveTelegramUser";
import {confirmUserRequest} from "#server/bot/handlers/auth/success/confirmUserRequest";
import {failedChannelSubscriber} from "#server/bot/handlers/auth/fail/failedChannelSubscriber";
import {sendSubscriptionSuccessMessage} from "#server/bot/handlers/auth/success/sendSubscriptionSuccessMessage";
import {checkChannelSubscriber} from "#server/bot/handlers/auth/check/checkChannelSubscriber";
import {failedLoginToken} from "#server/bot/handlers/commands/start/failedLoginToken";

export const processTelegramAuth = async (ctx: any, authRequests: Map<string, number>, sendSuccessMessage: boolean = false) => {

    try {

        const isChannelSubscriber = await checkChannelSubscriber(ctx)

        if (!isChannelSubscriber) {
            await failedChannelSubscriber(ctx, authRequests)
            return false
        }

        await saveTelegramUser(ctx)
        await confirmUserRequest(ctx, authRequests)
        if (sendSuccessMessage) {
            await sendSubscriptionSuccessMessage(ctx, authRequests)
        }

        await ctx.deleteMessage()
        await failedLoginToken(ctx)

        return true

    } catch (error: any) {
        console.error(error)

        if (error.message.includes('member')) return

        await ctx.reply(
            `Подождите или повторите запрос позже`
        )

        return false
    }
}
