import {sendSubscriptionSuccessMessage} from "#server/bot/handlers/auth/success/sendSubscriptionSuccessMessage";
import {isSubscriber} from "#server/bot/handlers/channel/isSubscriber";
import {addMessageSession} from "#server/bot/services/session/addMessageSession";
import {SessionMessageType} from "#server/bot/consts/types/SessionMessageTypes";
import {menuBot} from "#server/bot/handlers/commands/start/menuBot";

export const processTelegramAuth = async (ctx: any, sendSuccessMessage: boolean = false) => {

    const checkSub = await isSubscriber(ctx)
    if (!checkSub) return

    try {

        if (sendSuccessMessage) {
            await sendSubscriptionSuccessMessage(ctx)
        } else {
            await menuBot(ctx)
        }

        return true

    } catch (error: any) {
        console.error(error)

        if (error.message.includes('member')) return

        const errorMessage = await ctx.reply(
            `Подождите или повторите запрос позже`
        )
        await addMessageSession(
            ctx.from.id,
            errorMessage.message_id,
            SessionMessageType.Error
        )

        return false
    }
}
