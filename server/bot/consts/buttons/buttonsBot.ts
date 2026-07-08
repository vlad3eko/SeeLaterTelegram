import {Markup} from "telegraf";

// Возвращаем чистый объект кнопки, без [ ]
export const SearchButtonBot = (text: string | undefined, mediaSearch?: string, buttonTitle?: string) => {

    if (buttonTitle) {
        return Markup.button.switchToCurrentChat(
            `🔍 ${text} «${mediaSearch}»`,
            buttonTitle)
    } else {
        return Markup.button.switchToCurrentChat(
            `${text}`,
            '')
    }

}

export const SaveMediaButtonBot = (mediaId: number, mediaType: string) => {
    return Markup.button.callback(
        '💾 Сохранить в коллекцию',
        `save_media_${mediaId}_${mediaType}`)
}

export const deleteMediaButtonBot = (media: any) => {
    return Markup.button.callback(
        '🗑 Удалить из коллекции',
        `delete_media_${media.id}`)
}
