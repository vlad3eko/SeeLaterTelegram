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
        '💾 Сохранить в коллекцию',
        `save_media_${mediaId}_${mediaType}`)
}

export const deleteMediaButtonBot = (mediaId: number, mediaType: string) => {
    return Markup.button.callback(
        '🗑 Удалить из коллекции',
        `delete_media_${mediaId}_${mediaType}`)
}

export const recommendationButtonBot = (genres?: any | undefined) => {

    if (!genres) return

    const genresList = genres.map(
        (genre: any) => {
            genre
                .split(' • ')
                .join(' ')
        }
    )

    console.log('genres button', genres)
    console.log('genre map ', genresList)

    return Markup.button.switchToCurrentChat(
        `📋 Похожие`,
        `${genresList}`
    )
}


export const checkBookmarksMedias = () => {
    return Markup.button.switchToCurrentChat(
        '📦 Коллекция',
        '#collection'
    )
}
