import {saveTelegramUser} from "#server/bot/handlers/auth/success/saveTelegramUser";
import {confirmUserRequest} from "#server/bot/handlers/auth/success/confirmUserRequest";
import {failedChannelSubscriber} from "#server/bot/handlers/auth/fail/failedChannelSubscriber";
import {sendSubscriptionSuccessMessage} from "#server/bot/handlers/auth/success/sendSubscriptionSuccessMessage";
import {checkChannelSubscriber} from "#server/bot/handlers/auth/check/checkChannelSubscriber";

export const processTelegramAuth = async (ctx: any) => {

    try {

        const isChannelSubscriber = await checkChannelSubscriber(ctx)

        if (!isChannelSubscriber) {
            await failedChannelSubscriber(ctx)
        }

        await saveTelegramUser(ctx)
        await confirmUserRequest(ctx)
        await sendSubscriptionSuccessMessage(ctx)

    } catch (error) {

        console.error(error)

        await ctx.reply(
            `❌ Ошибка проверки подписки ${error}`
        )
    }
}
