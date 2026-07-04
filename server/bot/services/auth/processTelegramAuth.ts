import {sendSubscriptionSuccessMessage} from "#server/bot/handlers/auth/success/sendSubscriptionSuccessMessage";
import {isSubscriber} from "#server/bot/handlers/channel/isSubscriber";
import {searchMedia} from "#server/bot/actions/media/searchMedia";
import {addMessageSession} from "#server/bot/services/session/addMessageSession";

export const processTelegramAuth = async (ctx: any, sendSuccessMessage: boolean = false) => {

    const checkSub = await isSubscriber(ctx)
    if (!checkSub) return

    try {

        if (sendSuccessMessage) {
            await sendSubscriptionSuccessMessage(ctx)
        } else {
            await searchMedia(ctx)
        }

        return true

    } catch (error: any) {
        console.error(error)

        if (error.message.includes('member')) return

        const message = await ctx.reply(
            `Подождите или повторите запрос позже`
        )
        await addMessageSession(
            ctx.from.id,
            message.message_id
        )

        return false
    }
}
