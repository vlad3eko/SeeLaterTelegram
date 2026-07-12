import {SearchStrategy} from "~/utils/search/strategy/enums";
import type {NormalizedSearchQuery} from "~/utils/search/typesSearch";
import {
    discoverMovies,
    getBookmarks,
    getPopularMovies,
    searchMixed,
    searchMulti
} from "~/utils/search/repository/tmdbRepository";

export const executeSearchStrategy = async (strategy: SearchStrategy, query: NormalizedSearchQuery, page: number = 1) => {

        query.page = page

    switch(strategy) {

        case SearchStrategy.SEARCH_BY_TEXT:
            return await searchMulti(query, page)

        case SearchStrategy.SEARCH_BY_FILTERS:
            return await discoverMovies(query, page)

        case SearchStrategy.SEARCH_MIXED:
            return await searchMixed(query, page)

        case SearchStrategy.POPULAR:
            return await getPopularMovies(query, page)

        case SearchStrategy.BOOKMARKS:
            return await getBookmarks(query)

        default:
            return {
                results:[]
            }
    }
}
