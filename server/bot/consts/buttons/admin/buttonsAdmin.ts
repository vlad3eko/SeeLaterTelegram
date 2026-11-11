import {Markup} from "telegraf"
import {
    ADMIN_CHANGE_TRAILER_KEY,
    ADMIN_DOWNLOAD_TRAILER,
    ADMIN_EDIT_CARD,
    ADMIN_EDIT_MEDIA,
    ADMIN_EDIT_OVERVIEW,
    ADMIN_EDIT_TEXT,
    ADMIN_EDIT_TYPE,
    ADMIN_PUBLISH_CARD
} from "#server/bot/callbacks/routes"
import type {ContentType} from "#server/global/engine/search/strategy/enums"

export const adminEditInlineCard = (mediaId: number, mediaType: string, contentType: string, keyTrailer: string | undefined) => {
    return Markup.button.callback(
        "✏️ РЕДАКТИРОВАТЬ",
        ADMIN_EDIT_CARD.encode({
            mediaId,
            mediaType: mediaType as 'movie' | 'tv',
            contentType: contentType as ContentType,
            keyTrailer
        })
    )
}

export const adminPublishInlineCard = (mediaId: number, mediaType: string, contentType: string, keyTrailer: string | undefined, isRichTypeCard: boolean = false) => {
    return Markup.button.callback(
        "🚀 ОПУБЛИКОВАТЬ",
        ADMIN_PUBLISH_CARD.encode({
            mediaId,
            mediaType: mediaType as 'movie' | 'tv',
            contentType: contentType as ContentType,
            keyTrailer,
            isRichTypeCard
        })
    )
}

export const adminDownloadTrailerInlineCard = () => {
    return Markup.button.callback(
        "⏬ Скачать трейлер",
        ADMIN_DOWNLOAD_TRAILER.encode()
    )
}

export const adminAddTrailerKeyInlineCard = () => {
    return Markup.button.callback(
        "Изменить ключ трейлера",
        ADMIN_CHANGE_TRAILER_KEY.encode()
    )
}

export const adminEditMediaInlineCard = () => {
    return Markup.button.callback(
        "🖼 Медиа",
        ADMIN_EDIT_MEDIA.encode()
    )
}

export const adminEditMessageInlineCard = () => {
    return Markup.button.callback(
        "📝 Текст",
        ADMIN_EDIT_TEXT.encode()
    )
}

export const adminEditOverviewInlineCard = () => {
    return Markup.button.callback(
        '📝 Описание',
        ADMIN_EDIT_OVERVIEW.encode()
    )
}

export const adminEditTypeInlineCard = () => {
    return Markup.button.callback(
        'Тип',
        ADMIN_EDIT_TYPE.encode()
    )
}
