import {parseSearchQuery} from "~/utils/engines/search/mapper/parseSearchQuery";
import {normalizeSearchQuery} from "~/utils/engines/search/mapper/normalizeSearchQuery";
import {resolveSearchStrategy} from "~/utils/engines/search/strategy/resolveSearchStrategy";
import {executeSearchStrategy} from "~/utils/engines/search/strategy/executeSearchStrategy";
import {normalizeTmdbMedia} from "~/utils/media/normalizeTmdbMedia";
import {filterTmdbMediaResults} from "~/utils/media/filterTmdbMediaResults";
import {normalizeMediaGenres} from "#server/bot/consts/media/normalizeMediaGenres";
import {sortMediaResults} from "~/utils/media/sortMediaResults";
import {loadGenres} from "#server/bot/consts/media/genresConvert";
import {saveLastSearchQuery} from "~/utils/engines/search/repository/tmdbRepository";
import {filterContentType} from "~/utils/engines/search/mapper/filterContentType";
import {SearchStrategy} from "~/utils/engines/search/strategy/enums";
import {getInlineCacheOptions} from "~/utils/engines/search/mapper/getInlineCacheOptions";

export const searchMediaEntry = async (query: string, page: number = 1, userId: number) => {

    await loadGenres()

    const parsed = parseSearchQuery(query, userId)
    await saveLastSearchQuery(parsed.filters.genres, parsed.filters?.mediaTypes[0], userId, parsed.filters.contentType)

    const normalized = normalizeSearchQuery(parsed, page)

    const strategy = resolveSearchStrategy(normalized)
    const cacheOptions = getInlineCacheOptions(strategy)

    const result = await executeSearchStrategy(strategy, normalized, page)

    result.results = result.results
        .map(normalizeTmdbMedia)
        .filter((media: any) => filterTmdbMediaResults(media, userId, {isBookmarks: strategy === SearchStrategy.BOOKMARKS}))
        .map(normalizeMediaGenres)
        .filter((media: any) => filterContentType(media, normalized.filters.contentType))
    if (page === 1 && !(parsed.filters.genres[0]?.startsWith('collection'))) {
        result.results = sortMediaResults(result.results)
    }

    return {
        ...result,
        inlineOptions: cacheOptions
    }
}
