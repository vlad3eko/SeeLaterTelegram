import {SearchStrategy} from "~/utils/search/strategy/enums";
import type {NormalizedSearchQuery} from "~/utils/search/typesSearch";
import {discoverMovies, getPopularMovies, searchMulti} from "~/utils/search/repository/tmdbRepository";

export const executeSearchStrategy = async (
    strategy: SearchStrategy,
    query: NormalizedSearchQuery
) => {

    switch(strategy) {
        case SearchStrategy.SEARCH_BY_TEXT:
            return searchMulti(query)

        case SearchStrategy.SEARCH_BY_FILTERS:
            return discoverMovies(query)

        case SearchStrategy.SEARCH_MIXED:
            return searchMulti(query)

        case SearchStrategy.POPULAR:
            return getPopularMovies(query)
    }
}
