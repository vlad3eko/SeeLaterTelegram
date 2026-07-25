import {Markup} from "telegraf";
import {
    adminEditInlineCard, adminEditMediaInlineCard, adminEditMessageInlineCard, adminPublishInlineCard,
    checkBookmarksMedias,
    deleteMediaButtonBot, recommendationButtonBot,
    SaveMediaButtonBot,
    SearchButtonBot
} from "#server/bot/consts/buttons/buttonsBot";
import type {TmdbGenre} from "~/types/tmdb.types";
import type {ContentType} from "~/utils/search/strategy/enums";

//Admin..

export type TypeButtonContext =
    'inline' | 'channel'

export const editMediaChoiceKeyboard = () => {

    return Markup.inlineKeyboard([
        [adminEditMediaInlineCard(), adminEditMessageInlineCard()]
    ]).reply_markup
}

//..Admin


export const keyboardSearchBot = (text?: string, query?: string) => {
    return Markup.inlineKeyboard([
        [SearchButtonBot(text, 'inline', query)]
    ]).reply_markup
}

export const keyboardSavedMediaCardBot = (mediaId: number, mediaType: string) => {
    return Markup.inlineKeyboard([
        [deleteMediaButtonBot(mediaId, mediaType)],
        [SearchButtonBot('Искать ещё')]
    ]).reply_markup
}

export const keyboardSendMediaCard = (mediaId: number, mediaType: string) => {
    return Markup.inlineKeyboard([
        [SearchButtonBot('Искать другое')],
        [SaveMediaButtonBot(mediaId, mediaType)]
    ]).reply_markup
}

export const keyboardSendMediaCardInline = (
    mediaId: number,
    mediaType: 'movie' | 'tv',
    contentType: ContentType,
    genres?: TmdbGenre[] | undefined,
    admin: boolean = false,
    ButtonContext: TypeButtonContext = 'inline',
) => {

    const keyboard = [
        [SearchButtonBot('Искать другое', ButtonContext), recommendationButtonBot(contentType, genres, ButtonContext, mediaId, mediaType)],
        [checkBookmarksMedias(ButtonContext)],
        [deleteMediaButtonBot(mediaId, mediaType), SaveMediaButtonBot(mediaId, mediaType, contentType)]
    ]

    if (admin) {
        keyboard.push([adminEditInlineCard(mediaId, mediaType, contentType), adminPublishInlineCard(mediaId, mediaType)])
    }

    return Markup.inlineKeyboard(keyboard).reply_markup
}
