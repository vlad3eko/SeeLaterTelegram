import { Markup } from "telegraf"
import { ContentStrategy, ContentTelegramMenu, STRATEGY_LABELS } from "~/utils/engines/content/strategy/enums"

export const createStrategyButton = (strategy: ContentStrategy, userId: number) => {
    return Markup.button.callback(STRATEGY_LABELS[strategy], `content_${strategy}_${userId}`)
}

export const backButton = () => Markup.button.callback('Назад', `content_chosen_${ContentTelegramMenu.START}`)
export const releaseButton = () => Markup.button.callback('📅 Скорые релизы', `content_chosen_${ContentTelegramMenu.RELEASE}`)
export const waitingButton = () => Markup.button.callback('🔥 Ожидаемые', `content_chosen_${ContentTelegramMenu.WAITING}`)
export const bestButton = () => Markup.button.callback('🎭 Лучшие по..', `content_chosen_${ContentTelegramMenu.BEST}`)
