import {Markup} from "telegraf";
import type {TypeButtonContext} from "#server/bot/consts/buttons/admin/keyboardAdmin";
import {ContentType} from "#server/global/engine/search/strategy/enums";
import type {TmdbGenre} from "~/types/tmdb.types";
import {getContentTypeLabel} from "~/utils/convert/library/getContentTypeLabel";
import {genresConvert} from "~/utils/convert/genresConvert";

export const startButtonBot = (
    text: string,
    query: string = ''
) => {
    return Markup.button.switchToCurrentChat(
        `${"🗂  " + text}`,
        query
    )
}

// Возвращаем чистый объект кнопки, без [ ]
export const SearchButtonBot = (
    text: string | undefined,
    ButtonContext: TypeButtonContext = 'inline',
    query: string = ''
) => {

    if (ButtonContext === 'channel') {
        return Markup.button.url(
            `${text ? "🔍 " + text : 'Поиск'}`,
            'https://t.me/kinomanovNet_bot?start=search'
        )
    }

    return Markup.button.switchToCurrentChat(
        `${text ? "🔍 " + text : 'Поиск'}`,
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

// PERSON KEYBOARD

export const mediaCast = (mediaId: number) => {

    return Markup.button.switchToCurrentChat(
        '🎭 Список актёров',
        `${mediaId} #cast`
    )
}


export const mediaPersonFirstJob = (personId: number, job: string) => {

    const isActor = job === 'Актёр' ? '' : '#crew'

    return Markup.button.switchToCurrentChat(
        job,
        `#person ${personId} ${isActor}`
    )
}

export const mediaPersonSecondJob = (personId: number, job: string) => {

    return Markup.button.switchToCurrentChat(
        job,
        `#person ${personId} #crew`
    )
}

// PERSON KEYBOARD
