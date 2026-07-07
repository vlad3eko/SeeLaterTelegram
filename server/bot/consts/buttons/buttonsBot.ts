import {Markup} from "telegraf";

export const SearchButtonBot = (text: string) => {
    return [
        Markup.button.switchToCurrentChat(
            `${text}`,
            ''
        )
    ]
}

export const SaveMediaButtonBot = (callback: any) => {
    return [
        Markup.button.callback(
            '💾 Сохранить в коллекцию',
            `save_media_${callback}`
        )
    ]
}

export const deleteMediaButtonBot = (media: any) => {
    return [
        Markup.button.callback(
            '🗑 Удалить из коллекции',
            `delete_media_${media.id}`
        )
    ]
}
