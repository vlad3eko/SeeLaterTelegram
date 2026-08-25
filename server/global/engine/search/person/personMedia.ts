import {normalizeTmdbMedia} from "~/utils/media/normalizeTmdbMedia";
import {filterMediaResults} from "#server/global/engine/search/mapper/filterMediaResults";
import {sortMediaResults} from "~/utils/media/sortMediaResults";

export const personMedia = (
    result: any,
    strategy: any,
    normalized: any,
    page: number,
    cacheOptions: any
) => {

    /*
     * ==================================================
     * 1. Нормализуем ВСЮ фильмографию
     * ==================================================
     */

    let results =
        (result.results || [])
            .map(normalizeTmdbMedia)


    const beforeFilter =
        results.length


    /*
     * ==================================================
     * 2. Общая фильтрация
     *
     * ВАЖНО:
     * filterMediaResults мутирует result.results.
     * Поэтому после него забираем filteredResult.results.
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
     * 3. Фильтрация по жанрам
     *
     * Для обычного поиска это делает searchMixed/discover.
     *
     * Но фильмография человека приходит отдельным
     * endpoint'ом, поэтому здесь её надо фильтровать
     * самостоятельно.
     * ==================================================
     */

    const genreIds =
        normalized.filters.genres || []


    if (genreIds.length) {

        results =
            results.filter(
                (media: any) => {

                    if (
                        !Array.isArray(
                            media.genre_ids
                        )
                    ) {
                        return false
                    }


                    return genreIds.every(
                        (genreId: number) =>
                            media.genre_ids.includes(
                                genreId
                            )
                    )
                }
            )
    }


    /*
     * ==================================================
     * 4. Сортируем ВСЮ фильмографию
     * ==================================================
     */

    results =
        sortMediaResults(
            results
        )


    /*
     * ==================================================
     * 5. Убираем дубли
     * ==================================================
     */

    const unique =
        new Map()


    for (const media of results) {

        const key =
            `${media.media_type}_${media.id}`


        if (!unique.has(key)) {
            unique.set(
                key,
                media
            )
        }
    }


    results =
        Array.from(
            unique.values()
        )


    /*
     * ==================================================
     * 6. Pagination
     *
     * Только ПОСЛЕ фильтрации + сортировки + dedupe
     * ==================================================
     */

    const PAGE_SIZE = 20


    const totalResults =
        results.length


    const totalPages =
        Math.ceil(
            totalResults /
            PAGE_SIZE
        )


    const start =
        (page - 1) *
        PAGE_SIZE


    const end =
        start +
        PAGE_SIZE


    const paginatedResults =
        results.slice(
            start,
            end
        )

    return {

        ...result,

        results:
        paginatedResults,

        page,

        total_results:
        totalResults,

        total_pages:
        totalPages,

        inlineOptions:
        cacheOptions
    }
}
