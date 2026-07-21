import {SessionMessageType} from "#server/bot/consts/types/SessionMessageTypes";
import {addMessageSession} from "#server/bot/services/session/addMessageSession";
import {keyboardSearchBot} from "#server/bot/consts/buttons/keyboardBot";

export const openInlineSearch = async (
    ctx: any,
    query: string
) => {

    console.log('[QUERY openInlineSearch]', query)

    const messageContinue =
        await ctx.reply(
            'Выберите действие:',
            {
                reply_markup:
                    keyboardSearchBot(
                        'Продолжить искать',
                        query
                    )
            }
        )


    await addMessageSession(
        ctx.from.id,
        SessionMessageType.SearchInline,
        {
            messageId:
            messageContinue.message_id
        }
    )
}
