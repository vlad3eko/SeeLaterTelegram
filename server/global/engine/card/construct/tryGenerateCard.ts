import {Markup} from "telegraf";
import {SearchButtonBot} from "#server/bot/consts/buttons/buttonsBot";
import type {queryCTX} from "#server/global/engine/card/enum/types";

export const tryGenerateCard = async (ctx: queryCTX | undefined, constructCaption: any, constructKeyboard: any) => {

    if (!ctx) return

    try {
        return await ctx.ctx.telegram.callApi(
            'editMessageText',
            {
                inline_message_id: ctx.inlineMessageId,
                rich_message: constructCaption,
                reply_markup: constructKeyboard
            }
        )
    } catch (error: any) {
        const description =
            error?.response?.description || ''

        if (
            error?.response?.error_code === 400 &&
            description.includes('message is not modified')
        ) {
            return
        }

        throw error
    }


}
