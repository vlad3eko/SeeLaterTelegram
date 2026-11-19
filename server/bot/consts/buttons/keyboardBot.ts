
import {Markup} from "telegraf";
import {
    checkBookmarksMedias,
    mediaCast, mediaPersonFirstJob, mediaPersonSecondJob, recommendationButtonBot,
    SaveMediaButtonBot,
    SearchButtonBot, startButtonBot
} from "#server/bot/consts/buttons/buttonsBot";
import type {TmdbGenre} from "~/types/tmdb.types";
import {
    adminEditInlineCard, adminPublishInlineCard
} from "#server/bot/consts/buttons/admin/buttonsAdmin";
import type {TypeButtonContext} from "#server/bot/consts/buttons/admin/keyboardAdmin";
import type {ContentType} from "#server/global/engine/search/strategy/enums";
import type {typeRichCard} from "#server/global/engine/card/enum/types";


export const keyboardStartBot = (text?: string, query?: string) => {
    return Markup.inlineKeyboard([
        [startButtonBot('Фильмы (2026)', '#фильмы (2026)')],
        [startButtonBot('Сериалы (2026)', '#сериалы (2026)')],
        [startButtonBot('Мульфильмы', '#мультфильм #приключения')],
        [checkBookmarksMedias('inline')],
        [SearchButtonBot('Искать другое', 'inline', query)]
    ]).reply_markup
}

export const keyboardSearchBot = (text?: string, query?: string) => {
    return Markup.inlineKeyboard([
        [SearchButtonBot(text, 'inline', query)]
    ]).reply_markup
}

export const keyboardSendMediaCardInline = (
    mediaId: number,
    mediaType: typeRichCard,
    contentType: ContentType,
    genres?: TmdbGenre[] | undefined,
    admin: boolean = false,
    ButtonContext: TypeButtonContext = 'inline',
    saveCount = 0,
    keyTrailer?: string | undefined,
    isRichTypeCard: boolean = false
) => {

    if (mediaType === 'person')
        return

    // Четыре кнопки в два ряда (решение владельца 20.11): «Коллекция» и «Удалить» убраны.
    const keyboard = [
        [SaveMediaButtonBot(mediaId, mediaType, ButtonContext, saveCount), recommendationButtonBot(contentType, ButtonContext, mediaId, mediaType)],
        [mediaCast(mediaId, mediaType, contentType, ButtonContext), SearchButtonBot('Поиск', ButtonContext)]
    ]

    if (admin) {
        keyboard.push(
            [adminEditInlineCard(mediaId, mediaType, contentType, keyTrailer), adminPublishInlineCard(mediaId, mediaType, contentType, keyTrailer, isRichTypeCard)])
    }

    return Markup.inlineKeyboard(keyboard).reply_markup
}

// PERSON KEYBOARD

export const keyboardPerson = (
    personId: number,
    firstJob: string,
    secondJob: string | undefined
) => {
    const keyboard = [
        [mediaPersonFirstJob(personId, firstJob)]
    ]

    if (secondJob)
        keyboard.push([mediaPersonSecondJob(personId, secondJob)])

    return Markup.inlineKeyboard(keyboard).reply_markup
}

// PERSON KEYBOARD
