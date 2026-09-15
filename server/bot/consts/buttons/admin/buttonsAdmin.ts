import {Markup} from "telegraf"

export const adminEditInlineCard = (mediaId: number, mediaType: string, contentType: string, keyTrailer: string | undefined) => {
    return Markup.button.callback(
        "✏️ РЕДАКТИРОВАТЬ",
        `edit_media_${mediaId}_${mediaType}_${contentType}_${keyTrailer}`
    )
}

export const adminPublishInlineCard = (mediaId: number, mediaType: string, contentType: string, keyTrailer: string | undefined, isRichTypeCard: boolean = false) => {
    return Markup.button.callback(
        "🚀 ОПУБЛИКОВАТЬ",
        `publish_media_${mediaId}_${mediaType}_${contentType}_${keyTrailer}_${isRichTypeCard}`
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

export const adminEditOverviewInlineCard = () => {
    return Markup.button.callback(
        '📝 Описание',
        'admin_edit_overview'
    )
}

export const adminEditTypeInlineCard = () => {
    return Markup.button.callback(
        'Тип',
        'admin_edit_type_card'
    )
}
