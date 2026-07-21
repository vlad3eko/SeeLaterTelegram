import {Markup} from "telegraf"
import type {TmdbGenre} from "~/types/tmdb.types"
import {ContentType, SearchStrategy} from "~/utils/search/strategy/enums"
import {genresConvert} from "~/utils/convert/genresConvert"
import {CONTENT_TYPE_LABELS} from "~/utils/convert/library/enumsLibrary"
import type {TypeButtonContext} from "#server/bot/consts/buttons/keyboardBot";


//ADMIN..
export const adminEditInlineCard = (mediaId: number, mediaType: string, contentType: string) => {
    return Markup.button.callback(
        "✏️ РЕДАКТИРОВАТЬ",
        `edit_media_${mediaId}_${mediaType}_${contentType}`
    )
}

export const adminPublishInlineCard = (mediaId: number, mediaType: string) => {
    return Markup.button.callback(
        "🚀 ОПУБЛИКОВАТЬ",
        `publish_media_${mediaId}_${mediaType}`
    )
}

export const adminEditMediaInlineCard = () => {
    return Markup.button.callback(
        "🖼 Медиа",
        `admin_edit_media`
    )
}

export const adminEditMessageInlineCard = () => {
    return Markup.button.callback(
        "📝 Текст",
        `admin_edit_text`
    )
}

//..ADMIN

// Возвращаем чистый объект кнопки, без [ ]
export const SearchButtonBot = (text: string | undefined, query?: string, ButtonContext?: TypeButtonContext) => {

    if (ButtonContext === 'channel') {
        return Markup.button.switchToChat(
            `${text ? "🔍" + text : 'Поиск'}`,
            query || ''
        )
    } else {
        return Markup.button.switchToCurrentChat(
            `${text ? "🔍" + text : 'Поиск'}`,
            query || ''
        )
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

export const recommendationButtonBot = (contentType: ContentType | undefined, genres: TmdbGenre[] | undefined, ButtonContext: TypeButtonContext) => {

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

    if (ButtonContext === 'channel') {
        return Markup.button.switchToChat(
            "📋 Похожие",
            `#${tag} ${query}`
        )
    } else {
        return Markup.button.switchToCurrentChat(
            "📋 Похожие",
            `#${tag} ${query}`
        )
    }
}

export const checkBookmarksMedias = (ButtonContext: TypeButtonContext) => {
    if (ButtonContext === 'channel') {
        return Markup.button.switchToChat(
            '📦 Коллекция',
            '#collection'
        )
    } else {
        return Markup.button.switchToCurrentChat(
            '📦 Коллекция',
            '#collection'
        )
    }
}
