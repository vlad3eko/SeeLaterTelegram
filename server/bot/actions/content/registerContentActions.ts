import {Telegraf} from "telegraf";
import {generateContentEntry} from "~/utils/engines/content/generateContentEntry";
import {contentChosenButton} from "~/utils/engines/content/navigate/contentChosenButton";
import {chosenListCard} from "~/utils/engines/content/navigate/chosenListCard";
import {COLLECTION_ACTION, CONTENT_LIST_CARD, CONTENT_MENU, CONTENT_STRATEGY} from "#server/bot/callbacks/routes";
import {collectionAction} from "#server/bot/actions/collections/collectionsActions";

export const registerContentActions = (bot: Telegraf) => {
    // Подборки /g (новый мастер). Права проверяет сам обработчик (canUseCollections).
    bot.action(COLLECTION_ACTION.pattern, collectionAction)
    // Старый /g: кнопки остались в старых сообщениях; строка списка открывает карточку и в новых подборках.
    bot.action(CONTENT_STRATEGY.pattern, generateContentEntry)
    bot.action(CONTENT_MENU.pattern, contentChosenButton)
    bot.action(CONTENT_LIST_CARD.pattern, chosenListCard)
}
