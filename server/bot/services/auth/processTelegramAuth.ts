import {sendSubscriptionSuccessMessage} from "#server/bot/handlers/auth/success/sendSubscriptionSuccessMessage";
import {isSubscriber} from "#server/bot/handlers/channel/isSubscriber";
import {searchMedia} from "#server/bot/actions/media/searchMedia";

export const processTelegramAuth = async (ctx: any, sendSuccessMessage: boolean = false) => {

    const checkSub = await isSubscriber(ctx)
    if (!checkSub) return

    try {

        if (sendSuccessMessage) {
            await sendSubscriptionSuccessMessage(ctx)
        } else {
            await searchMedia(ctx as any, {mode: 'start'})
        }

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
