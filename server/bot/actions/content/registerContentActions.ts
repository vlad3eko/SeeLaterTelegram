import {Telegraf} from "telegraf";
import {generateContentEntry} from "~/utils/engines/content/generateContentEntry";
import {contentChosenButton} from "~/utils/engines/content/navigate/contentChosenButton";
import {chosenListCard} from "~/utils/engines/content/navigate/chosenListCard";
import {COLLECTION_ACTION, CONTENT_LIST_CARD, CONTENT_MENU, CONTENT_STRATEGY, NOTIFY_BACK, NOTIFY_CARD, NOTIFY_MORE, SIMILAR_CARD, SIMILAR_LIST} from "#server/bot/callbacks/routes";
import {collectionAction} from "#server/bot/actions/collections/collectionsActions";
import {similarCardAction, similarListAction} from "#server/bot/actions/similar/similarActions";
import {notifyBackAction, notifyCardAction, notifyMoreAction} from "#server/bot/actions/notifications/notifyCardAction";

export const registerContentActions = (bot: Telegraf) => {
    // Подборки /g (новый мастер). Права проверяет сам обработчик (canUseCollections).
    bot.action(COLLECTION_ACTION.pattern, collectionAction)
    // «🔗 Похожее» на карточке — для всех: список похожих ↔ карточка в том же сообщении.
    bot.action(SIMILAR_LIST.pattern, similarListAction)
    bot.action(SIMILAR_CARD.pattern, similarCardAction)
    // Сводка обновлений коллекции: карточка в том же сообщении и «◀️ К сводке».
    bot.action(NOTIFY_CARD.pattern, notifyCardAction)
    bot.action(NOTIFY_BACK.pattern, notifyBackAction)
    bot.action(NOTIFY_MORE.pattern, notifyMoreAction)
    // Старый /g: кнопки остались в старых сообщениях; строка списка открывает карточку и в новых подборках.
    bot.action(CONTENT_STRATEGY.pattern, generateContentEntry)
    bot.action(CONTENT_MENU.pattern, contentChosenButton)
    bot.action(CONTENT_LIST_CARD.pattern, chosenListCard)
}
