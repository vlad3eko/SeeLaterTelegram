import {findGenre} from "~/utils/media/findGenre";
import type {NormalizedSearchQuery, SearchQuery} from "#server/global/engine/search/mapper/typesSearch";

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
            id: query.filters.id,
            personJob: query.filters.personJob,
            years: query.filters.years,
            providers: [],
            countries: query.filters.countries,
            companies: [],
            mediaTypes: query.filters.mediaTypes,
            contentType: query.filters.contentType,
            creditType: query.filters?.creditType,
            sort: query.filters.sort,
            vote: query.filters.vote,
        }
    }
}
