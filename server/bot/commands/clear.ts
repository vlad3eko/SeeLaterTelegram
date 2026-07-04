import {addSessionMessage} from "#server/bot/services/session/addSessionMessage";
import {cleanupExpiredSessions} from "#server/bot/services/session/cleanupExpiredSessions";

export async function clear(ctx: any) {

    await ctx.deleteMessage()
    const message = await ctx.reply()
    try {
        await cleanupExpiredSessions()
    } catch (e) {
        throw createError({
            message: `Ошибка clear: ${e}`
        })
    } finally {
        await addSessionMessage(
            ctx.from.id,
            message.message_id
        )
    }


}
