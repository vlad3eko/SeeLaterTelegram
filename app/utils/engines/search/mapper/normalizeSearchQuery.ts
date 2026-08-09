import type {NormalizedSearchQuery, SearchQuery} from "~/utils/engines/search/mapper/typesSearch";
import {findGenre} from "~/utils/media/findGenre";

export const normalizeSearchQuery = (
    query: SearchQuery,
    page: number = 1
): NormalizedSearchQuery => {

    const mediaType =
        query.filters.mediaTypes[0] || "movie"

    return {
        from: query.from,
        text: query.text,
        page: page,
        filters: {
            genres: findGenre(query.filters.genres, mediaType),
            years: query.filters.years,
            providers: [],
            countries: query.filters.countries,
            companies: [],
            mediaTypes: query.filters.mediaTypes,
            contentType: query.filters.contentType,
            sort: query.filters.sort,
            vote: query.filters.vote,
        }
    }
}
