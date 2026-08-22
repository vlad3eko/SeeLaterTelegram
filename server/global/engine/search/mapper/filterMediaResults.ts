import {filterTmdbMediaResults} from "~/utils/media/filterTmdbMediaResults";
import {filterContentType} from "#server/global/engine/search/mapper/filterContentType";
import {normalizeMediaGenres} from "#server/bot/consts/media/normalizeMediaGenres";
import {SearchStrategy} from "#server/global/engine/search/strategy/enums";

export const filterMediaResults = (result: any, strategy: any, normalized: any) => {
    result.results = result.results.filter((media: any) => filterTmdbMediaResults(media, {isBookmarks: strategy === SearchStrategy.BOOKMARKS}))
        .map(normalizeMediaGenres)
        .filter((media: any) => filterContentType(media, normalized.filters.contentType))
}
