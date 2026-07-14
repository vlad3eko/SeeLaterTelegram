import {Markup} from "telegraf";
import {
    checkBookmarksMedias,
    deleteMediaButtonBot, recommendationButtonBot,
    SaveMediaButtonBot,
    SearchButtonBot
} from "#server/bot/consts/buttons/buttonsBot";

export const keyboardSearchBot = (text?: string, mediaSearch?: string, buttonTitle?: string) => {

    if (buttonTitle) {
        return Markup.inlineKeyboard([
            [SearchButtonBot(text, mediaSearch, buttonTitle)]
        ]).reply_markup
    } else {
        return Markup.inlineKeyboard([
            [SearchButtonBot('Поиск')]
        ]).reply_markup
    }
}

export const keyboardSavedMediaCardBot = (mediaId: number, mediaType: string) => {
    return Markup.inlineKeyboard([
        [deleteMediaButtonBot(mediaId, mediaType)],
        [SearchButtonBot('Искать ещё')]
    ]).reply_markup
}

export const keyboardSendMediaCard = (mediaId: number, mediaType: string) => {
    return Markup.inlineKeyboard([
        [SearchButtonBot('Искать другое')],
        [SaveMediaButtonBot(mediaId, mediaType)]
    ]).reply_markup
}

export const keyboardSendMediaCardInline = async (mediaId: number, mediaType: string, user: number) => {

    return Markup.inlineKeyboard([
        [SearchButtonBot('Искать другое')],
        [await recommendationButtonBot(mediaId, mediaType)],
        [checkBookmarksMedias()],
        [deleteMediaButtonBot(mediaId, mediaType), SaveMediaButtonBot(mediaId, mediaType)]
    ]).reply_markup
}
