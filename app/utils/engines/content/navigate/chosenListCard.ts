import type {typeRichCard} from "#server/global/engine/card/enum/types";
import {engineRichCard} from "#server/global/engine/card/engineRichCard";
import {ContentType} from "#server/global/engine/search/strategy/enums";
import {SearchButtonBot} from "#server/bot/consts/buttons/buttonsBot";
import {Markup} from "telegraf";
import {isAdmin} from "#server/bot/consts/admins";
import {getAdminEditSession} from "#server/bot/actions/admin/adminEditSession";

export const chosenListCard = async (ctx: any) => {

    const [, mediaType, contentType, mediaId] = ctx.match
    const admin = isAdmin(ctx.from.id)

    try {
        return await engineRichCard(
            {
                ctx,
                isAdmin: admin
            },
            {
                id: Number(mediaId),
                type: mediaType as typeRichCard,
                status: 'ready',
                contentType: contentType as ContentType
            }
        )

    } catch (error) {

        console.error(
            '[RICH LIST ITEM ERROR]',
            error
        )

        try {

            await ctx.telegram.callApi(
                'editMessageText',
                {
                    chat_id: ctx.callbackQuery.message?.chat.id,
                    message_id: ctx.callbackQuery.message?.message_id,
                    text: '⚠️ Не удалось загрузить карточку.\n\n' +
                        'Попробуйте повторить поиск.',
                    parse_mode: 'HTML',
                    reply_markup: Markup.inlineKeyboard([
                        [
                            SearchButtonBot('Искать другое', 'inline')
                        ]
                    ]).reply_markup
                }
            )

        } catch (editError) {

            console.error(
                '[RICH LIST ITEM ERROR EDIT]',
                editError
            )
        }
    }
}
