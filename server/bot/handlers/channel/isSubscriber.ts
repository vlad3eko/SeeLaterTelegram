import {checkChannelSubscriber} from "#server/bot/handlers/auth/check/checkChannelSubscriber";
import {failedChannelSubscriber} from "#server/bot/handlers/auth/fail/failedChannelSubscriber";
import {updateSubscriber} from "#server/bot/services/auth/updateSubscriber";

export const isSubscriber = async (ctx: any) => {
    const isChannelSubscriber = await checkChannelSubscriber(ctx)

    await updateSubscriber(ctx.from.id, isChannelSubscriber)

    if (!isChannelSubscriber) {
        await failedChannelSubscriber(ctx)
        await ctx.deleteMessage()
        return false
    }

    return true
}
