import {SearchStrategy} from "#server/global/engine/search/strategy/enums";
import type {NormalizedSearchQuery} from "#server/global/engine/search/mapper/typesSearch";
import {
    discoverMovies, getBookmarks, getPopularMovies,
    searchMixed,
    searchMulti,
    searchPerson
} from "#server/global/engine/search/repository/tmdbRepository";

export const executeSearchStrategy = async (strategy: SearchStrategy, query: NormalizedSearchQuery, page: number = 1) => {

        query.page = page

    switch(strategy) {

        case SearchStrategy.PERSON:
            return await searchPerson(query)

        case SearchStrategy.SEARCH_BY_TEXT:
            return await searchMulti(query, page)

        case SearchStrategy.SEARCH_BY_FILTERS:
            return await discoverMovies(query, page)

        case SearchStrategy.SEARCH_MIXED:
            return await searchMixed(query, page)

        case SearchStrategy.POPULAR:
            return await getPopularMovies(query, page)

        case SearchStrategy.BOOKMARKS:
            return await getBookmarks(query, page)

        default:
            return {
                results:[]
            }
    }
}
