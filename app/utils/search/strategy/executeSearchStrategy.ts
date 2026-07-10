import {SearchStrategy} from "~/utils/search/strategy/enums";
import type {NormalizedSearchQuery} from "~/utils/search/typesSearch";
import {discoverMovies, getPopularMovies, searchMixed, searchMulti} from "~/utils/search/repository/tmdbRepository";

export const executeSearchStrategy = async (strategy: SearchStrategy, query: NormalizedSearchQuery) => {

    switch(strategy) {

        case SearchStrategy.SEARCH_BY_TEXT:
            return await searchMulti(query)

        case SearchStrategy.SEARCH_BY_FILTERS:
            return await discoverMovies(query)

        case SearchStrategy.SEARCH_MIXED:
            return await searchMixed(query)

        case SearchStrategy.POPULAR:
            return await getPopularMovies(query)

        default:
            return {
                results:[]
            }
    }
}
