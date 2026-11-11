import {Telegraf} from "telegraf";
import {generateContentEntry} from "~/utils/engines/content/generateContentEntry";
import {contentChosenButton} from "~/utils/engines/content/navigate/contentChosenButton";
import {chosenListCard} from "~/utils/engines/content/navigate/chosenListCard";
import {CONTENT_LIST_CARD, CONTENT_MENU, CONTENT_STRATEGY} from "#server/bot/callbacks/routes";

export const registerContentActions = (bot: Telegraf) => {
    bot.action(CONTENT_STRATEGY.pattern, generateContentEntry)
    bot.action(CONTENT_MENU.pattern, contentChosenButton)
    bot.action(CONTENT_LIST_CARD.pattern, chosenListCard)
}
