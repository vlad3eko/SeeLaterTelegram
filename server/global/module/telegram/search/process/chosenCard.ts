
import {isAdmin} from "#server/bot/consts/admins";
import {engineRichCard} from "#server/global/engine/card/engineRichCard";
import type {ContentType} from "#server/global/engine/search/strategy/enums";
import type {typeRichCard} from "#server/global/engine/card/enum/types";
import {Markup} from "telegraf";
import {SearchButtonBot} from "#server/bot/consts/buttons/buttonsBot";

export const chosenCard = async (ctx: any) => {

    const result = ctx.update.chosen_inline_result
    const inlineMessageId = result?.inline_message_id

    if (!inlineMessageId)
        return

    if (result.result_id === 'no_search_results' || result.result_id === 'empty_collection')
        return

    const [, mediaType, contentType, mediaId] = result.result_id.split('_')
    const admin = isAdmin(result.from.id)



    try {

    await engineRichCard({
            ctx,
            inlineMessageId,
            isAdmin: admin
        }, {
            id: Number(mediaId),
            type: mediaType as typeRichCard,
            status: 'ready',
            contentType: contentType as ContentType
        })
    }  catch (error) {
        console.error('[CHOSEN CARD ERROR]', error)
        try {
            await ctx.telegram.editMessageText(
                undefined,
                undefined,
                inlineMessageId,
                '⚠️ Не удалось загрузить карточку.\n\nПопробуйте повторить поиск.',
                {
                    parse_mode: 'HTML',
                    reply_markup:
                    Markup.inlineKeyboard([
                        [
                            SearchButtonBot(
                                'Искать другое',
                                'inline'
                            )
                        ]
                    ]).reply_markup
                }
            )
        } catch (editError) {
            console.error('[CHOSEN CARD ERROR EDIT]', editError)
        }
    }

}
