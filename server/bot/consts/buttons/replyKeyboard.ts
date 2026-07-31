import {Markup} from "telegraf";

export const replyKey = {
    COLLECTION: '📦 Коллекция',
    MENU: 'Меню',
    RANDOM: '🆕 Что посмотреть?'
}

export const mainKeyboard = Markup.keyboard([
    [
        replyKey.MENU,
        // replyKey.RANDOM
    ],
    [
        Markup.button.switchToCurrentChat(
            replyKey.COLLECTION,
            "#collection"
        )
    ]
])
    .resize()
    .persistent()
