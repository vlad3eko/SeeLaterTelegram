import {saveTelegramUser} from "#server/bot/handlers/auth/success/saveTelegramUser";
import {confirmUserRequest} from "#server/bot/handlers/auth/success/confirmUserRequest";
import {failedChannelSubscriber} from "#server/bot/handlers/auth/fail/failedChannelSubscriber";
import {sendSubscriptionSuccessMessage} from "#server/bot/handlers/auth/success/sendSubscriptionSuccessMessage";
import {checkChannelSubscriber} from "#server/bot/handlers/auth/check/checkChannelSubscriber";

export const processTelegramAuth = async (ctx: any, authRequests: Map<string, number>, sendSuccessMessage: boolean = true) => {

    try {

        await saveTelegramUser(ctx)
        await confirmUserRequest(ctx, authRequests)
        if (sendSuccessMessage) {
            await sendSubscriptionSuccessMessage(ctx)
        }

        return true

    } catch (error) {

        const isChannelSubscriber = await checkChannelSubscriber(ctx)

        console.error(error)

        if (!isChannelSubscriber) {
            await failedChannelSubscriber(ctx)
            return
        }

        await ctx.reply(
            `Подождите или повторите запрос позже`
        )

        return false
    }
}
