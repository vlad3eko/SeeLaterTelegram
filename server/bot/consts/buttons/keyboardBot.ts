import {Markup} from "telegraf";

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
