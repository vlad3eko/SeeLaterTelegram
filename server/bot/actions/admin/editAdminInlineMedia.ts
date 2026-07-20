import {editMediaChoiceKeyboard} from "#server/bot/consts/buttons/keyboardBot";
import {setAdminEditSession} from "#server/bot/actions/admin/adminEditSession";

export const editAdminInlineMedia = async (ctx: any) => {

    const inlineMessageId =
        ctx.callbackQuery.inline_message_id

    if (!inlineMessageId) return


    setAdminEditSession(
        ctx.from.id,
        {
            inlineMessageId,
            mode:null as any
        }
    )

    await ctx.editMessageReplyMarkup(
        editMediaChoiceKeyboard()
    )

    await ctx.answerCbQuery()

}
