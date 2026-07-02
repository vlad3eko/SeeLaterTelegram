import {checkChannelSubscriber} from "#server/bot/handlers/auth/check/checkChannelSubscriber";
import {failedChannelSubscriber} from "#server/bot/handlers/auth/fail/failedChannelSubscriber";

export const isSubscriber = async (ctx: any) => {
    const isChannelSubscriber = await checkChannelSubscriber(ctx)

    if (!isChannelSubscriber) {
        await failedChannelSubscriber(ctx)
        return false
    }
}
