import {Markup} from "telegraf";

// Возвращаем чистый объект кнопки, без [ ]
export const SearchButtonBot = (text: string | undefined, mediaSearch?: string, buttonTitle?: string) => {

    if (buttonTitle) {
        return Markup.button.switchToCurrentChat(
            `🔍 ${text} «${mediaSearch}»`,
            buttonTitle)
    } else {
        return Markup.button.switchToCurrentChat(
            `🔍 ${text}`,
            '')
    }

}

export const SaveMediaButtonBot = (mediaId: number, mediaType: string) => {
    return Markup.button.callback(
        '💾 Сохранить',
        `save_media_${mediaId}_${mediaType}`)
}

export const deleteMediaButtonBot = (mediaId: number, mediaType: string) => {
    return Markup.button.callback(
        '🗑 Удалить',
        `delete_media_${mediaId}_${mediaType}`)
}

export const recommendationButtonBot = (mediaType: string, genres: any | undefined) => {

    const query = genres?.replaceAll(" • ", " ") ?? ""
    mediaType =
        mediaType === 'movie'
            ? 'фильм'
            : 'сериал'

    return Markup.button.switchToCurrentChat(
        `📋 Похожие`,
        `#${mediaType} ${query}`
    )
}


export const checkBookmarksMedias = () => {
    return Markup.button.switchToCurrentChat(
        '📦 Коллекция',
        '#collection'
    )
}
