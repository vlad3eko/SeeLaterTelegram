import {Markup} from "telegraf";
import type {TmdbGenre} from "~/types/tmdb.types";

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

export const recommendationButtonBot = (mediaType: string, genres: TmdbGenre[] | string) => {

    let query

    if (mediaType !== 'фильм' && mediaType !== 'сериал') {
        query = typeof genres === 'string'
            ? genres.split(' • ').filter(g => g !== '#мультфильм').join(' ')
            : genres?.filter(g => g.name !== '#мультфильм').map(g => g.name).join(' ') ?? ''
    } else query = typeof genres === 'string'
        ? genres.split(' • ').join(' ')
        : genres?.map(g => g.name).join(' ') ?? ''



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
