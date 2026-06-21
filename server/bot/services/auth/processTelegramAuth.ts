import {saveTelegramUser} from "#server/bot/handlers/auth/success/saveTelegramUser";
import {confirmUserRequest} from "#server/bot/handlers/auth/success/confirmUserRequest";
import {failedChannelSubscriber} from "#server/bot/handlers/auth/fail/failedChannelSubscriber";
import {sendSubscriptionSuccessMessage} from "#server/bot/handlers/auth/success/sendSubscriptionSuccessMessage";
import {checkChannelSubscriber} from "#server/bot/handlers/auth/check/checkChannelSubscriber";

export const processTelegramAuth = async (ctx: any, authRequests: Map<string, number>) => {

    try {

        const isChannelSubscriber = await checkChannelSubscriber(ctx)

        if (!isChannelSubscriber) {
            await failedChannelSubscriber(ctx)
            return false
        }

        await saveTelegramUser(ctx)
        await confirmUserRequest(ctx, authRequests)
        await sendSubscriptionSuccessMessage(ctx)

        return true

    } catch (error) {

        console.error(error)

        await ctx.reply(
            `❌ Ошибка проверки подписки ${error}`
        )

        await ctx.reply(
            `Подождите или повторите запрос позже`
        )

        return false
    }
}
