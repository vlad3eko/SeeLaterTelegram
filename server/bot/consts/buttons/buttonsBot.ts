
import {Markup} from "telegraf";
import type {TypeButtonContext} from "#server/bot/consts/buttons/admin/keyboardAdmin";
import {ContentType} from "#server/global/engine/search/strategy/enums";
import {telegramBotShortLink} from "#server/global/oneLinkApp";
import {contentTypeConvert} from "~/utils/convert/contentTypeConvert";
import {CHECK_SUBSCRIPTION, SAVE_MEDIA, SIMILAR_LIST} from "#server/bot/callbacks/routes";

export const startButtonBot = (
    text: string,
    query: string = ''
) => {
    return Markup.button.switchToCurrentChat(
        `${"🗂  " + text}`,
        query
    )
}

export const LoadingButtonTelegramCard = () => {
    return Markup.button.switchToCurrentChat(
        '⏳ Загрузка',
        ''
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
            `${telegramBotShortLink}?start=search`
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
        SAVE_MEDIA.encode({mediaId, mediaType: mediaType as 'movie' | 'tv'})
    )
}

// Под сообщением «Подпишитесь на канал» (failedChannelSubscriber).
export const checkSubscriptionButtonBot = () => {
    return Markup.button.callback(
        'Проверить подписку',
        CHECK_SUBSCRIPTION.encode()
    )
}

/**
 * «🔗 Похожее»: список похожих тайтлов с трейлерами в том же сообщении (server/bot/actions/similar).
 * Из канала — ссылка в бота: там список приходит новым сообщением.
 */
export const recommendationButtonBot = (
    contentType: ContentType,
    ButtonContext: TypeButtonContext,
    mediaId: number,
    mediaType: 'movie' | 'tv'
) => ButtonContext === 'channel'
    ? Markup.button.url('🔗 Похожее', `${telegramBotShortLink}?start=similar_${mediaType}_${mediaId}_${contentType}`)
    : Markup.button.callback('🔗 Похожее', SIMILAR_LIST.encode({mediaType, mediaId, contentType}))

export const checkBookmarksMedias = (
    ButtonContext: TypeButtonContext = 'inline'
) => {

    if (ButtonContext === 'channel') {

        return Markup.button.url(
            '📦 Коллекция',
            `${telegramBotShortLink}?start=collection`
        )
    }

    return Markup.button.switchToCurrentChat(
        '📦 Коллекция',
        '#collection'
    )
}

// PERSON KEYBOARD

export const mediaCast = (mediaId: number, mediaType: string, contentType: ContentType, ButtonContext: TypeButtonContext) => {

    const type = contentTypeConvert(mediaType, contentType)

    if (ButtonContext === 'channel') {

        return Markup.button.url(
            '🎭 Актёры',
            `${telegramBotShortLink}?start=media_cast_${contentType}_${mediaId}`
        )
    }

    return Markup.button.switchToCurrentChat(
        '🎭 Актёры',
        `#${type} ${mediaId} #cast`
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
