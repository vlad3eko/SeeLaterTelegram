import type {NormalizedSearchQuery} from "~/utils/engines/search/mapper/typesSearch";
import {SearchStrategy} from "~/utils/engines/search/strategy/enums";

export const resolveSearchStrategy = (
    query: NormalizedSearchQuery
): SearchStrategy => {

    const hasText =
        query.text.length > 0

    const hasFilters =
        query.filters.genres.length > 0
        || query.filters.years.length > 0
        || query.filters.providers.length > 0
        || query.filters.countries.length > 0
        || query.filters.companies.length > 0
        || query.filters.mediaTypes.length > 0
        || query.filters.contentType

    const hasFromUserId =
        query.from

    if (hasText && hasFilters) {
        return SearchStrategy.SEARCH_MIXED
    }

    if (hasText) {
        return SearchStrategy.SEARCH_BY_TEXT
    }

    if (hasFilters) {
        return SearchStrategy.SEARCH_BY_FILTERS
    }

    if (hasFromUserId) {
        return SearchStrategy.BOOKMARKS
    }

    return SearchStrategy.POPULAR
}
