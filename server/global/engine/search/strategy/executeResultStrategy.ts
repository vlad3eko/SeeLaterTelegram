import {sortMediaResults} from "~/utils/media/sortMediaResults";
import {filterMediaResults} from "#server/global/engine/search/mapper/filterMediaResults";
import {normalizeTmdbMedia} from "~/utils/media/normalizeTmdbMedia";
import {creditsSearch} from "#server/global/engine/search/person/creditsSearch";
import {SearchStrategy} from "#server/global/engine/search/strategy/enums";
import {personMedia} from "#server/global/engine/search/person/personMedia";
import {personSearch} from "#server/global/engine/search/person/personSearch";

export const executeResultStrategy = (
    strategy: any,
    normalized: any,
    result: any,
    cacheOptions: any,
    page: any,
    parsed: any,
) => {

    if (strategy === SearchStrategy.PERSON && !normalized.filters.id?.length) {
        return personSearch(result, cacheOptions)
    }

    if (strategy === SearchStrategy.PERSON && normalized.filters.id?.length) {
        return personMedia(result, strategy, normalized, page, cacheOptions)
    }

    if (strategy === SearchStrategy.CREDITS) {
        return creditsSearch(result, page, cacheOptions)
    }

    result.results = (result.results || []).map(normalizeTmdbMedia)
    filterMediaResults(result, strategy, normalized)

    if (page === 1 && !parsed.filters.isCollection) {
        result.results = sortMediaResults(result.results)
    }
}
