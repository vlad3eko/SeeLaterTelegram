import type { NormalizedSearchQuery } from "#server/bot/services/engines/global/engine/search/mapper/typesSearch"

export const buildTmdbParams = (
    query: NormalizedSearchQuery,
    page = 1
) => {

    return {

        page,

        with_genres:
            query.filters.genres.join(","),

        primary_release_year:
            query.filters.years[0],

        with_origin_country:
            query.filters.countries.join(","),

        with_watch_providers:
            query.filters.providers.join("|"),

        with_companies:
            query.filters.companies.join("|"),

        sort_by:
        query.filters.sort,

        vote_average_gte:
        query.filters.vote

    }

}
