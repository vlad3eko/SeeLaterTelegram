
import {Markup} from "telegraf";
import {
    adminAddTrailerKeyInlineCard,
    adminDownloadTrailerInlineCard,
    adminEditMediaInlineCard,
    adminEditMessageInlineCard,
    adminEditOverviewInlineCard, adminEditTypeInlineCard
} from "#server/bot/consts/buttons/admin/buttonsAdmin";

export type TypeButtonContext =
    'inline' | 'channel'

export const editMediaChoiceKeyboard = () => {

    return Markup.inlineKeyboard([
        [adminEditMediaInlineCard()],
        [adminEditMessageInlineCard()],
        [adminEditOverviewInlineCard()],
        [adminEditTypeInlineCard()],
        [adminDownloadTrailerInlineCard()],
        [adminAddTrailerKeyInlineCard()]
    ]).reply_markup
}
