import {Telegraf} from "telegraf";
import {generateContentEntry} from "~/utils/engines/content/generateContentEntry";
import {contentChosenButton} from "~/utils/engines/content/navigate/contentChosenButton";

export const registerContentActions = (bot: Telegraf) => {
    bot.action(/^content_([A-Z_]+)_(\d+)$/, generateContentEntry)
    bot.action(/^content_chosen_([A-Z_]+)$/, contentChosenButton)
}
