
import { Markup } from "telegraf"
import { ContentStrategy, ContentTelegramMenu, STRATEGY_LABELS } from "~/utils/engines/content/strategy/enums"
import {CONTENT_LIST_CARD, CONTENT_MENU, CONTENT_STRATEGY} from "#server/bot/callbacks/routes"

export const createStrategyButton = (strategy: ContentStrategy, userId: number) => {
    return Markup.button.callback(STRATEGY_LABELS[strategy], CONTENT_STRATEGY.encode({strategy, userId}))
}

export const backButton = () => Markup.button.callback('Назад', CONTENT_MENU.encode({menu: ContentTelegramMenu.START}))
export const releaseButton = () => Markup.button.callback('📅 Скорые релизы', CONTENT_MENU.encode({menu: ContentTelegramMenu.RELEASE}))
export const waitingButton = () => Markup.button.callback('🔥 Ожидаемые', CONTENT_MENU.encode({menu: ContentTelegramMenu.WAITING}))
export const bestButton = () => Markup.button.callback('🎭 Лучшие по..', CONTENT_MENU.encode({menu: ContentTelegramMenu.BEST}))

// Строка списка подборки (createRichListKeyboard): открывает карточку фильма.
export const contentListCardButton = (
    text: string,
    query: {type: string, contentType: string, id: string | number}
) => Markup.button.callback(
    text,
    CONTENT_LIST_CARD.encode({
        mediaType: String(query.type),
        contentType: String(query.contentType),
        mediaId: String(query.id)
    })
)
