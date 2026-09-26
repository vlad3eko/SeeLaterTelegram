
import {Markup} from "telegraf";
import {
    adminDownloadTrailerInlineCard,
    adminEditMediaInlineCard,
    adminEditMessageInlineCard,
    adminEditOverviewInlineCard, adminEditTypeInlineCard, adminPublishInlineCard
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
    ]).reply_markup
}
