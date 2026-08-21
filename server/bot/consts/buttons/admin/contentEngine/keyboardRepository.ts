import { Markup } from "telegraf"
import { ContentStrategy, ContentTelegramMenu, SUBMENUS } from "~/utils/engines/content/strategy/enums"
import {
    createStrategyButton,
    backButton,
    releaseButton,
    waitingButton,
    bestButton
} from "./buttonsRepository"

// Главное меню
export const startContentKeyboard = (userId: number) => {
    return Markup.inlineKeyboard([
        [releaseButton()],
        [waitingButton()],
        [bestButton()],
        [createStrategyButton(ContentStrategy.WHAT_WATCH_TODAY, userId)],
        [createStrategyButton(ContentStrategy.LOOKALIKE_AT_MEDIA_NAME, userId)],
    ]).reply_markup
}

const createSubmenuKeyboard = (menuType: Exclude<ContentTelegramMenu, ContentTelegramMenu.START>, userId: number) => {
    return Markup.inlineKeyboard([
        // Автоматически строит строки кнопок на основе массивов из SUBMENUS
        ...SUBMENUS[menuType].map(strategy => [createStrategyButton(strategy, userId)]),
        [backButton()],
    ]).reply_markup
}

export const releasesKeyboard = (userId: number) => createSubmenuKeyboard(ContentTelegramMenu.RELEASE, userId)
export const mostWaitingKeyboard = (userId: number) => createSubmenuKeyboard(ContentTelegramMenu.WAITING, userId)
export const bestByAttributeKeyboard = (userId: number) => createSubmenuKeyboard(ContentTelegramMenu.BEST, userId)
