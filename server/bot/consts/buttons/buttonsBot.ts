import {Markup} from "telegraf"
import type {TmdbGenre} from "~/types/tmdb.types"
import {ContentType, SearchStrategy} from "~/utils/search/strategy/enums"
import {genresConvert} from "~/utils/convert/genresConvert"
import {CONTENT_TYPE_LABELS} from "~/utils/convert/library/enumsLibrary"
import type {TypeButtonContext} from "#server/bot/consts/buttons/keyboardBot";
import {getContentTypeLabel} from "~/utils/convert/library/getContentTypeLabel";


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
export const SearchButtonBot = (
    text: string | undefined,
    ButtonContext: TypeButtonContext = 'inline',
    query: string = ''
) => {

    if (ButtonContext === 'channel') {
        return Markup.button.url(
            `${text ? "🔍" + text : 'Поиск'}`,
            'https://t.me/kinomanovNet_bot?start=search'
        )
    }

    return Markup.button.switchToCurrentChat(
        `${text ? "🔍" + text : 'Поиск'}`,
        query
    )
}

export const SaveMediaButtonBot = (mediaId: number, mediaType: string, ButtonContext: TypeButtonContext, saveCount = 0) => {
    const text =
        ButtonContext === 'channel'
            ? `💾 Сохранить (${saveCount})`
            : '💾 Сохранить'

    return Markup.button.callback(
        text,
        `save_media_${mediaId}_${mediaType}`
    )
}

export const deleteMediaButtonBot = (mediaId: number, mediaType: string) => {
    return Markup.button.callback(
        '🗑 Удалить',
        `delete_media_${mediaId}_${mediaType}`)
}

export const recommendationButtonBot = (
    contentType: ContentType | undefined,
    genres: TmdbGenre[] | undefined,
    ButtonContext: TypeButtonContext,
    mediaId?: number,
    mediaType?: 'movie' | 'tv'
) => {

    console.log('[recommendationButtonBot]', contentType)

    if (ButtonContext === 'channel') {

        return Markup.button.url(
            '📋 Похожие',
            `https://t.me/kinomanovNet_bot?start=similar_${mediaType}_${mediaId}_${contentType}`
        )
    }

    const tag =
        getContentTypeLabel(contentType)

    let query =
        genresConvert(genres)

    if (
        contentType === ContentType.CARTOON ||
        contentType === ContentType.CARTOON_SERIES ||
        contentType === ContentType.ANIME
    ) {
        query = query
            .replaceAll('#мультфильм', '')
            .trim()
    }

    query = query
        .replaceAll('•', ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase()

    return Markup.button.switchToCurrentChat(
        '📋 Похожие',
        `#${tag}${query ? ` ${query}` : ''}`
    )
}

export const checkBookmarksMedias = (
    ButtonContext: TypeButtonContext
) => {

    if (ButtonContext === 'channel') {

        return Markup.button.url(
            '📦 Коллекция',
            'https://t.me/kinomanovNet_bot?start=collection'
        )
    }

    return Markup.button.switchToCurrentChat(
        '📦 Коллекция',
        '#collection'
    )
}
