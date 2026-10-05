import type {queryCTX} from "#server/global/engine/card/enum/types"

export const normalizeRichContext = (
    ctx: any
): queryCTX | undefined => {

    if (!ctx) {
        return
    }

    /*
     * Уже передан queryCTX:
     *
     * {
     *     ctx,
     *     inlineMessageId?,
     *     chatId?,
     *     messageId?
     * }
     */
    if (ctx.ctx) {

        return {

            ...ctx,

            inlineMessageId:
                ctx.inlineMessageId ??
                ctx.ctx.callbackQuery?.inline_message_id,

            chatId:
                ctx.chatId ??
                ctx.ctx.callbackQuery?.message?.chat?.id,

            messageId:
                ctx.messageId ??
                ctx.ctx.callbackQuery?.message?.message_id
        }
    }

    /*
     * Передан обычный Telegraf context.
     */
    return {

        ctx,

        inlineMessageId:
        ctx.callbackQuery?.inline_message_id,

        chatId:
            ctx.callbackQuery?.message?.chat?.id ??
            ctx.chat?.id,

        messageId:
            ctx.callbackQuery?.message?.message_id ??
            ctx.message?.message_id,

        isAdmin:
            Boolean(
                ctx.state?.isAdmin
            )
    }
}
