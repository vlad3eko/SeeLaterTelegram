import {Markup} from "telegraf"
import type {TmdbGenre} from "~/types/tmdb.types"
import {ContentType, SearchStrategy} from "~/utils/search/strategy/enums"
import {genresConvert} from "~/utils/convert/genresConvert"
import {CONTENT_TYPE_LABELS} from "~/utils/convert/library/enumsLibrary"


//ADMIN..
export const adminEditInlineCard = (mediaId: number, mediaType: string) => {
    return Markup.button.callback(
        "✏️ РЕДАКТИРОВАТЬ",
        `edit_media_${mediaId}_${mediaType}`
    )
}

export const adminPublishInlineCard = (mediaId: number, mediaType: string) => {
    return Markup.button.callback(
        "🚀 ОПУБЛИКОВАТЬ",
        `publish_media_${mediaId}_${mediaType}`
    )
}
//..ADMIN

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

    const tag = CONTENT_TYPE_LABELS[contentType ?? ContentType.MOVIE]

    let query = genresConvert(genres)

    if (
        contentType === ContentType.CARTOON
        || contentType === ContentType.CARTOON_SERIES
        || contentType === ContentType.ANIME
    ) {
        query = query.replaceAll("#мультфильм", "").trim()
    }

    query = query
        .replaceAll("•", " ")
        .replace(/\s+/g, " ")
        .trim().toLowerCase()

    return Markup.button.switchToCurrentChat(
        "📋 Похожие",
        `#${tag} ${query}`
    )

}

export const checkBookmarksMedias = () => {
    return Markup.button.switchToCurrentChat(
        '📦 Коллекция',
        '#collection'
    )
}
