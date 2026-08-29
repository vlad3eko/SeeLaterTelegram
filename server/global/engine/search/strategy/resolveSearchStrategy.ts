import {NormalizedSearchQuery} from "#server/global/engine/search/mapper/typesSearch";
import {SearchStrategy} from "#server/global/engine/search/strategy/enums";

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
        || query.filters.id.length > 0
        || query.filters.creditType
        || query.filters.personJob.length > 0

    const hasFromUserId =
        Boolean(query.from)

    const hasId =
        query.filters.id.length > 0

    const hasCreditType =
        Boolean(query.filters.creditType)

    const isPerson =
        query.filters.contentType === "person"

    if (hasFromUserId || query.filters.isCollection) {
        return SearchStrategy.BOOKMARKS
    }
    /*
     * ==========================================
     * PERSON
     *
     * #person
     * #person 2219
     * #person 2219 #cast
     * ==========================================
     */

    if (isPerson) {
        return SearchStrategy.PERSON
    }


    /*
     * ==========================================
     * CREDITS
     *
     * 634649 #cast
     * 634649 #crew
     *
     * Здесь ID относится к media,
     * а его тип определит credits API.
     * ==========================================
     */

    if (hasId && hasCreditType) {
        return SearchStrategy.CREDITS
    }


    /*
     * ==========================================
     * LEGACY PERSON ID
     *
     * Сохраняем старое поведение:
     *
     * 2219
     *
     * ==========================================
     */

    if (hasId) {
        return SearchStrategy.PERSON
    }


    if (hasText && hasFilters) {
        return SearchStrategy.SEARCH_MIXED
    }


    if (hasText) {
        return SearchStrategy.SEARCH_BY_TEXT
    }


    if (hasFilters) {
        return SearchStrategy.SEARCH_BY_FILTERS
    }



    return SearchStrategy.POPULAR
}
