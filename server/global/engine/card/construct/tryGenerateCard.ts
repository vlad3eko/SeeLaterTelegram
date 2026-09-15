import {Markup} from "telegraf";
import {SearchButtonBot} from "#server/bot/consts/buttons/buttonsBot";
import type {queryCTX} from "#server/global/engine/card/enum/types";

export const tryGenerateCard = async (ctx: queryCTX | undefined, constructCaption: any, constructKeyboard: any) => {

    if (!ctx) return

        return await ctx.ctx.telegram.callApi(
            'editMessageText',
            {
                inline_message_id: ctx.inlineMessageId,
                rich_message: constructCaption,
                reply_markup: constructKeyboard
            }
        )
}
