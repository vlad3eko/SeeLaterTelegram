import {Markup} from "telegraf";
import {
    checkBookmarksMedias,
    deleteMediaButtonBot, recommendationButtonBot,
    SaveMediaButtonBot,
    SearchButtonBot
} from "#server/bot/consts/buttons/buttonsBot";
import type {TmdbGenre} from "~/types/tmdb.types";
import type {ContentType} from "~/utils/search/strategy/enums";

export const keyboardSearchBot = (text?: string, query?: string) => {
    return Markup.inlineKeyboard([
        [SearchButtonBot(text, query)]
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
    mediaType: "movie" | "tv",
    contentType: ContentType,
    genres?: TmdbGenre[]
) => {

    return Markup.inlineKeyboard([
        [
            SearchButtonBot('Искать другое'),
            recommendationButtonBot(contentType, genres)
        ],
        [checkBookmarksMedias()],
        [
            deleteMediaButtonBot(mediaId, mediaType),
            SaveMediaButtonBot(mediaId, mediaType)
        ]
    ]).reply_markup
}
