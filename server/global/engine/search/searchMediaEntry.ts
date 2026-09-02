import {executeSearchStrategy} from "#server/global/engine/search/strategy/executeSearchStrategy";
import {loadGenres} from "#server/bot/consts/media/genresConvert";
import {parseSearchQuery} from "#server/global/engine/search/mapper/parseSearchQuery";
import {saveLastSearchQuery} from "#server/global/engine/search/repository/tmdbRepository";
import {normalizeSearchQuery} from "#server/global/engine/search/mapper/normalizeSearchQuery";
import {resolveSearchStrategy} from "#server/global/engine/search/strategy/resolveSearchStrategy";
import {setInlineCacheOptions} from "#server/global/engine/search/mapper/getInlineCacheOptions";
import {executeResultStrategy} from "#server/global/engine/search/strategy/executeResultStrategy";

export const searchMediaEntry = async (query: string, page: number = 1, userId: number) => {

    await loadGenres()

    const parsed = parseSearchQuery(query, userId)
    console.log('parsed', parsed)

    await saveLastSearchQuery(parsed.filters.genres, parsed.filters?.mediaTypes[0], userId, parsed.filters.contentType)

    const normalized = normalizeSearchQuery(parsed, page)
    console.log('normalized', normalized)

    const strategy = resolveSearchStrategy(normalized)
    const cacheOptions = setInlineCacheOptions(strategy)
    console.log('strategy', strategy)

    const results = await executeSearchStrategy(strategy, normalized, page)
    const result = executeResultStrategy(strategy, normalized, results, cacheOptions, page, parsed)

    return {
        ...result,

        inlineOptions: cacheOptions
    }
}
