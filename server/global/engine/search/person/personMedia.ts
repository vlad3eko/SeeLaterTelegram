import { normalizeTmdbMedia } from "#server/global/engine/search/mapper/normalizeTmdbMedia"
import { filterMediaResults } from "#server/global/engine/search/mapper/filterMediaResults"
import { sortMediaResults } from "#server/global/engine/search/mapper/sortMediaResults"

export const personMedia = (
    result: any,
    strategy: any,
    normalized: any,
    page: number,
    cacheOptions: any
) => {

    /*
     * ==================================================
     * 1. NORMALIZE
     * ==================================================
     */

    let results =
        (result.results || [])
            .map(normalizeTmdbMedia)


    /*
     * ==================================================
     * 2. FILTER
     * ==================================================
     */

    const filteredResult = {
        ...result,
        results
    }

    filterMediaResults(
        filteredResult,
        strategy,
        normalized
    )

    results =
        filteredResult.results


    /*
     * ==================================================
     * 3. SORT
     * ==================================================
     */

    results =
        sortMediaResults(results)


    /*
     * ==================================================
     * 4. UNIQUE
     * ==================================================
     */

    const unique =
        new Map<string, any>()

    for (const media of results) {

        const key =
            `${media.media_type}_${media.id}`

        if (!unique.has(key)) {
            unique.set(key, media)
        }
    }

    results =
        Array.from(unique.values())


    /*
     * ==================================================
     * 5. PAGINATION
     * ==================================================
     */

    const PAGE_SIZE = 20

    const totalResults =
        results.length

    const totalPages =
        Math.ceil(
            totalResults / PAGE_SIZE
        )

    const start =
        (page - 1) * PAGE_SIZE

    const paginatedResults =
        results.slice(
            start,
            start + PAGE_SIZE
        )

    return {

        ...result,

        results: paginatedResults,

        page,

        total_results:
        totalResults,

        total_pages:
        totalPages,

        inlineOptions:
        cacheOptions
    }
}
