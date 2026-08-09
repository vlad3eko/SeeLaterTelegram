import {Markup} from "telegraf";
import {
    adminEditMediaInlineCard,
    adminEditMessageInlineCard,
    adminEditOverviewInlineCard
} from "#server/bot/consts/buttons/admin/buttonsAdmin";

export type TypeButtonContext =
    'inline' | 'channel'

export const editMediaChoiceKeyboard = () => {

    return Markup.inlineKeyboard([
        [adminEditMediaInlineCard()],
        [adminEditMessageInlineCard()],
        [adminEditOverviewInlineCard()]
    ]).reply_markup
}
