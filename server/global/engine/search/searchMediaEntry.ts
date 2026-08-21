import {normalizeTmdbMedia} from "~/utils/media/normalizeTmdbMedia";
import {filterTmdbMediaResults} from "~/utils/media/filterTmdbMediaResults";
import {normalizeMediaGenres} from "#server/bot/consts/media/normalizeMediaGenres";
import {sortMediaResults} from "~/utils/media/sortMediaResults";
import {loadGenres} from "#server/bot/consts/media/genresConvert";
import {parseSearchQuery} from "#server/global/engine/search/mapper/parseSearchQuery";
import {normalizeSearchQuery} from "#server/global/engine/search/mapper/normalizeSearchQuery";
import {resolveSearchStrategy} from "#server/global/engine/search/strategy/resolveSearchStrategy";
import {getInlineCacheOptions} from "#server/global/engine/search/mapper/getInlineCacheOptions";
import {executeSearchStrategy} from "#server/global/engine/search/strategy/executeSearchStrategy";
import {SearchStrategy} from "#server/global/engine/search/strategy/enums";
import {filterContentType} from "#server/global/engine/search/mapper/filterContentType";
import {saveLastSearchQuery} from "#server/global/engine/search/repository/tmdbRepository";

export const searchMediaEntry = async (query: string, page: number = 1, userId: number) => {

    await loadGenres()
    console.log('query', query)

    const parsed = parseSearchQuery(query, userId)
    await saveLastSearchQuery(parsed.filters.genres, parsed.filters?.mediaTypes[0], userId, parsed.filters.contentType)

    const normalized = normalizeSearchQuery(parsed, page)

    const strategy = resolveSearchStrategy(normalized)
    const cacheOptions = getInlineCacheOptions(strategy)

    const result = await executeSearchStrategy(strategy, normalized, page)

    console.log('================ SEARCH DEBUG ================')
    console.log('strategy:', strategy)
    console.log('normalized:', normalized)
    console.log('result:', result)
    console.log('result.results:', result?.results)
    console.log('================================================')

    result.results = result.results
        .map(normalizeTmdbMedia)

    if (!(strategy === 'PERSON')) {
        result.results = result.results.filter((media: any) => filterTmdbMediaResults(media, userId, {isBookmarks: strategy === SearchStrategy.BOOKMARKS}))
            .map(normalizeMediaGenres)
            .filter((media: any) => filterContentType(media, normalized.filters.contentType))
        if (page === 1 && !(parsed.filters.genres[0]?.startsWith('collection'))) {
            result.results = sortMediaResults(result.results)
        }
    } else {
        result.results = result.results
            .filter((person: any) => person.profile_path !== null)
            .sort((a: any, b: any) => b.popularity - a.popularity)
    }

    return {
        ...result,
        inlineOptions: cacheOptions,
    }
}
