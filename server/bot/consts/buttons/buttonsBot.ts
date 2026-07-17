import {Markup} from "telegraf";

// Возвращаем чистый объект кнопки, без [ ]
export const SearchButtonBot = (text: string | undefined, query?: string) => {
    return Markup.button.switchToCurrentChat(
        `${text ? "🔍" + text : 'Поиск'}`,
        query || ''
    )
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

    const query = Array.isArray(genres)
        ? genres.filter(g => g.name !== '#мультфильм')
            .map(g => g.name != '#мультфильм').join(" ")
        : genres?.replaceAll(" • ", " ") ?? ""

    console.log('q', query)

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
