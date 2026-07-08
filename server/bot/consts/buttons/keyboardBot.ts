import {Markup} from "telegraf";
import {deleteMediaButtonBot, SaveMediaButtonBot, SearchButtonBot} from "#server/bot/consts/buttons/buttonsBot";

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

export const keyboardSavedMediaCardBot = (media: any) => {
    return Markup.inlineKeyboard([
        [deleteMediaButtonBot(media)],
        [SearchButtonBot('Искать ещё')]
    ]).reply_markup
}

export const keyboardSendMediaCard = (mediaId: number, mediaType: string) => {
    return Markup.inlineKeyboard([
        [SearchButtonBot('Искать другое')],
        [SaveMediaButtonBot(mediaId, mediaType)]
    ]).reply_markup
}

export const keyboardSendMediaCardInline = (mediaId: number, mediaType: string) => {

    return Markup.inlineKeyboard([
        [SearchButtonBot('Искать другое')],
        [SaveMediaButtonBot(mediaId, mediaType)]
    ]).reply_markup
}
