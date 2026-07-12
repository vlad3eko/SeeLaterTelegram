import type {NormalizedSearchQuery, SearchQuery} from "~/utils/search/typesSearch";
import {findGenre} from "~/utils/media/findGenre";

export const normalizeSearchQuery = (
    query: SearchQuery,
    page: number = 1
): NormalizedSearchQuery => {

    const mediaType =
        query.filters.mediaTypes[0] || "movie"

    return {
        text: query.text,
        page: page,
        filters: {
            genres: findGenre(query.filters.genres, mediaType),
            years: query.filters.years,
            providers: [],
            countries: query.filters.countries,
            companies: [],
            mediaTypes: query.filters.mediaTypes,
            sort: query.filters.sort,
            vote: query.filters.vote,
            bookmarks: query.filters.bookmarks
        }
    }
}
