import {saveTelegramUser} from "#server/bot/handlers/auth/success/saveTelegramUser";
import {confirmUserRequest} from "#server/bot/handlers/auth/success/confirmUserRequest";
import {failedChannelSubscriber} from "#server/bot/handlers/auth/fail/failedChannelSubscriber";
import {sendSubscriptionSuccessMessage} from "#server/bot/handlers/auth/success/sendSubscriptionSuccessMessage";
import {checkChannelSubscriber} from "#server/bot/handlers/auth/check/checkChannelSubscriber";

export const processTelegramAuth = async (ctx: any, authRequests: Map<string, number>, sendSuccessMessage: boolean = true) => {

    try {

        await checkChannelSubscriber(ctx)

        await saveTelegramUser(ctx)
        await confirmUserRequest(ctx, authRequests)
        if (sendSuccessMessage) {
            await sendSubscriptionSuccessMessage(ctx)
        }

        return true

    } catch (error: any) {

        console.error(error)

        if (error.message.includes('400')) {
            await failedChannelSubscriber(ctx)
            return
        }

        await ctx.reply(
            `Подпишитесь чтобы продолжить`
        )

        return false
    }
}
