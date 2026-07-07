import {Markup} from "telegraf";
import {deleteMediaButtonBot, SaveMediaButtonBot, SearchButtonBot} from "#server/bot/consts/buttons/buttonsBot";

export const keyboardSMenuBot = () => {
    return Markup.inlineKeyboard([
        SearchButtonBot('🔍 Поиск'),
    ]).reply_markup
}

export const keyboardSavedMediaCardBot = (media: any) => {
    return Markup.inlineKeyboard([
        deleteMediaButtonBot(media),
        SearchButtonBot('🔍 Искать ещё')
    ]).reply_markup
}

export const keyboardSendMediaCard = (ctx: any, callback: any) => {
    return Markup.inlineKeyboard([
        SearchButtonBot('🔍 Искать другое'),
        SaveMediaButtonBot(callback)
    ]).reply_markup
}
