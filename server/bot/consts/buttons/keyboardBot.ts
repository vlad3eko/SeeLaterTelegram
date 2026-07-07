import {Markup} from "telegraf";

export const keyboardSMenuBot = () => {
    return Markup.inlineKeyboard([
        [
            Markup.button.switchToCurrentChat(
                '🔍 Поиск',
                ''
            )
        ]
    ]).reply_markup
}

export const keyboardSavedMediaCardBot = (media: any) => {
    return Markup.inlineKeyboard([
        [
            Markup.button.callback(
                '🗑 Удалить из коллекции',
                `delete_media_${media.id}`
            )
        ],
        [
            Markup.button.switchToCurrentChat(
                `🔍 Искать ещё`,
                ''
            )
        ]
    ]).reply_markup
}
