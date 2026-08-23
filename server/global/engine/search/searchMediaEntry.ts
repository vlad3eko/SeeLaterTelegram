import {normalizeTmdbMedia} from "~/utils/media/normalizeTmdbMedia";
import {sortMediaResults} from "~/utils/media/sortMediaResults";
import {loadGenres} from "#server/bot/consts/media/genresConvert";
import {parseSearchQuery} from "#server/global/engine/search/mapper/parseSearchQuery";
import {normalizeSearchQuery} from "#server/global/engine/search/mapper/normalizeSearchQuery";
import {resolveSearchStrategy} from "#server/global/engine/search/strategy/resolveSearchStrategy";
import {executeSearchStrategy} from "#server/global/engine/search/strategy/executeSearchStrategy";
import {SearchStrategy} from "#server/global/engine/search/strategy/enums";
import {saveLastSearchQuery} from "#server/global/engine/search/repository/tmdbRepository";
import {setInlineCacheOptions} from "#server/global/engine/search/mapper/getInlineCacheOptions";
import {filterMediaResults} from "#server/global/engine/search/mapper/filterMediaResults";

export const searchMediaEntry = async (
    query: string,
    page: number = 1,
    userId: number
) => {

    await loadGenres()

    /*
     * =========================
     * PARSE
     * =========================
     */

    const parsed =
        parseSearchQuery(
            query,
            userId
        )

    await saveLastSearchQuery(
        parsed.filters.genres,
        parsed.filters.mediaTypes[0],
        userId,
        parsed.filters.contentType
    )

    /*
     * =========================
     * NORMALIZE
     * =========================
     */

    const normalized =
        normalizeSearchQuery(
            parsed,
            page
        )

    /*
     * =========================
     * STRATEGY
     * =========================
     */

    const strategy =
        resolveSearchStrategy(
            normalized
        )

    /*
     * =========================
     * API
     * =========================
     */

    const result =
        await executeSearchStrategy(
            strategy,
            normalized,
            page
        )

    console.log(
        '================ SEARCH DEBUG ================'
    )

    console.log(
        'query:',
        query
    )

    console.log(
        'strategy:',
        strategy
    )

    console.log(
        'page:',
        page
    )

    console.log(
        'normalized:',
        normalized
    )

    console.log(
        'API results:',
        result?.results?.length
    )

    console.log(
        'total_results:',
        result?.total_results
    )

    console.log(
        'total_pages:',
        result?.total_pages
    )

    console.log(
        '================================================'
    )

    /*
     * =========================
     * NORMALIZE TMDB MEDIA
     * =========================
     */

    result.results =
        (result.results || [])
            .map((media: any) =>
                normalizeTmdbMedia(media)
            )

    /*
     * =========================
     * FILTER
     * =========================
     */

    filterMediaResults(
        result,
        strategy,
        normalized
    )

    /*
     * =========================
     * PERSON SORT
     * =========================
     */

    if (strategy === SearchStrategy.PERSON) {

        result.results =
            result.results
                .filter(
                    (person: any) =>
                        Boolean(
                            person.profile_path
                        )
                )
                .sort(
                    (a: any, b: any) =>
                        (b.popularity || 0) -
                        (a.popularity || 0)
                )

        const totalResults =
            result.results.length

        const totalPages =
            Math.ceil(
                totalResults / 20
            )

        const start =
            (page - 1) * 20

        result.results =
            result.results.slice(
                start,
                start + 20
            )

        result.page =
            page

        result.total_results =
            totalResults

        result.total_pages =
            totalPages
    }

    /*
     * =========================
     * MEDIA SORT
     * =========================
     *
     * Людей здесь не сортируем.
     */

    if (
        strategy !== SearchStrategy.PERSON &&
        page === 1 &&
        !parsed.filters.genres[0]?.startsWith(
            'collection'
        )
    ) {

        result.results =
            sortMediaResults(
                result.results
            )
    }

    return {
        ...result,

        inlineOptions:
            setInlineCacheOptions(
                strategy
            )
    }
}
