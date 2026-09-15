import {Markup} from "telegraf";
import {
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
        [adminEditTypeInlineCard()]
    ]).reply_markup
}
