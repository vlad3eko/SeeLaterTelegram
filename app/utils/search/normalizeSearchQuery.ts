import type {NormalizedSearchQuery, SearchQuery} from "~/utils/search/typesSearch";
import {findGenre} from "~/utils/movie/findGenre";

export const normalizeSearchQuery = (
    query: SearchQuery
): NormalizedSearchQuery => {

    return {
        text: query.text,
        page: query.page,
        filters: {
            genres: findGenre(query.filters.genres, "movie"),
            years: query.filters.years,
            providers: [],
            countries: query.filters.countries,
            companies: [],
            mediaTypes: query.filters.mediaTypes,
            sort: query.filters.sort,
            vote: query.filters.vote
        }
    }
}
