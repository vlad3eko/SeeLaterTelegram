import type {
    queryCTX
} from "#server/global/engine/card/enum/types"

export const tryGenerateCard = async (
    ctx: queryCTX | undefined,
    constructCaption: any,
    constructKeyboard: any
) => {

    if (!ctx) {
        return
    }

    try {

        const payload: any = {

            rich_message:
            constructCaption,

            reply_markup:
            constructKeyboard
        }

        /*
         * INLINE MESSAGE
         */
        if (ctx.inlineMessageId) {

            payload.inline_message_id =
                ctx.inlineMessageId
        }

        /*
         * REGULAR MESSAGE
         */
        else if (
            ctx.chatId !== undefined &&
            ctx.messageId !== undefined
        ) {

            payload.chat_id =
                ctx.chatId

            payload.message_id =
                ctx.messageId
        }

        else {

            throw new Error(
                '[tryGenerateCard] Message target not found'
            )
        }

        return await ctx.ctx.telegram.callApi(
            'editMessageText',
            payload
        )

    } catch (error: any) {

        const description =
            error?.response?.description || ''

        if (
            error?.response?.error_code === 400 &&
            description.includes(
                'message is not modified'
            )
        ) {
            return
        }

        throw error
    }
}
