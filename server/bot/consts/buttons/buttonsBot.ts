import {Markup} from "telegraf";
import type {TmdbGenre} from "~/types/tmdb.types";
import {ContentType, SearchStrategy} from "~/utils/search/strategy/enums";
import {genresConvert} from "~/utils/convert/genresConvert";
import {un} from "vue-router/dist/index-D_VEAp3P";


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

export const recommendationButtonBot = (contentType: ContentType | undefined, genres: TmdbGenre[] | undefined) => {


    const genresContent = genresConvert(genres)

    let tag = ''

    switch (contentType) {

        case ContentType.MOVIE:
            tag = 'фильм'
            break

        case ContentType.CARTOON:
            tag = 'мультфильм'
            break

        case ContentType.SERIES:
            tag = 'сериал'
            break

        case ContentType.CARTOON_SERIES:
            tag = 'мультсериал'
            break

        case ContentType.ANIME:
            tag = 'аниме'
            break

    }

    let query =
        typeof genres === 'string'
            ? genres
            : genres
            ?.map(g => g.name)
            .join(' ') ?? ''

    if (
        contentType === ContentType.CARTOON ||
        contentType === ContentType.CARTOON_SERIES
    ) {
        query = query.replaceAll('#мультфильм', '')
    }

    if (contentType === ContentType.ANIME) {
        query = query.replaceAll('#мультфильм', '')
    }

    return Markup.button.switchToCurrentChat(
        '📋 Похожие',
        `#${tag} ${query.trim()}`
    )
}


export const checkBookmarksMedias = () => {
    return Markup.button.switchToCurrentChat(
        '📦 Коллекция',
        '#collection'
    )
}
