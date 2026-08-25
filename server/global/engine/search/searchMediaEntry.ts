import {executeSearchStrategy} from "#server/global/engine/search/strategy/executeSearchStrategy";
import {loadGenres} from "#server/bot/consts/media/genresConvert";
import {parseSearchQuery} from "#server/global/engine/search/mapper/parseSearchQuery";
import {saveLastSearchQuery} from "#server/global/engine/search/repository/tmdbRepository";
import {normalizeSearchQuery} from "#server/global/engine/search/mapper/normalizeSearchQuery";
import {resolveSearchStrategy} from "#server/global/engine/search/strategy/resolveSearchStrategy";
import {setInlineCacheOptions} from "#server/global/engine/search/mapper/getInlineCacheOptions";
import {SearchStrategy} from "#server/global/engine/search/strategy/enums";
import {personSearch} from "#server/global/engine/search/person/personSearch";
import {personMedia} from "#server/global/engine/search/person/personMedia";
import {normalizeTmdbMedia} from "~/utils/media/normalizeTmdbMedia";
import {filterMediaResults} from "#server/global/engine/search/mapper/filterMediaResults";
import {sortMediaResults} from "~/utils/media/sortMediaResults";

export const searchMediaEntry = async (
    query: string,
    page: number = 1,
    userId: number
) => {

    await loadGenres()

    const parsed = parseSearchQuery(query, userId)
    await saveLastSearchQuery(parsed.filters.genres, parsed.filters?.mediaTypes[0], userId, parsed.filters.contentType)

    const normalized = normalizeSearchQuery(parsed, page)
    console.log('normalized', normalized )
    const strategy = resolveSearchStrategy(normalized)
    console.log('strategy', strategy )
    const cacheOptions = setInlineCacheOptions(strategy)

    const result = await executeSearchStrategy(strategy, normalized, page)
    console.log('result', result.results[0])


    if (strategy === SearchStrategy.PERSON && !normalized.filters.id?.length)
        return personSearch(result, cacheOptions)

    if (strategy === SearchStrategy.PERSON && normalized.filters.id?.length)
        return personMedia(result, strategy, normalized, page, cacheOptions)

    result.results = (result.results || []).map(normalizeTmdbMedia)
    filterMediaResults(result, strategy, normalized)

    if (page === 1 && !parsed.filters.genres[0]?.startsWith('collection')) {
        result.results = sortMediaResults(result.results)
    }

    return {
        ...result,

        inlineOptions: cacheOptions
    }
}
