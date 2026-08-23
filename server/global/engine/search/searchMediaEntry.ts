import {sortMediaResults} from "~/utils/media/sortMediaResults";
import {filterMediaResults} from "#server/global/engine/search/mapper/filterMediaResults";
import {loadGenres} from "#server/bot/consts/media/genresConvert";
import {parseSearchQuery} from "#server/global/engine/search/mapper/parseSearchQuery";
import {saveLastSearchQuery} from "#server/global/engine/search/repository/tmdbRepository";
import {normalizeSearchQuery} from "#server/global/engine/search/mapper/normalizeSearchQuery";
import {resolveSearchStrategy} from "#server/global/engine/search/strategy/resolveSearchStrategy";
import {setInlineCacheOptions} from "#server/global/engine/search/mapper/getInlineCacheOptions";
import {executeSearchStrategy} from "#server/global/engine/search/strategy/executeSearchStrategy";
import {SearchStrategy} from "#server/global/engine/search/strategy/enums";
import {normalizeTmdbMedia} from "~/utils/media/normalizeTmdbMedia";

export const searchMediaEntry = async (
    query: string,
    page: number = 1,
    userId: number
) => {

    await loadGenres()


    const parsed =
        parseSearchQuery(
            query,
            userId
        )


    await saveLastSearchQuery(
        parsed.filters.genres,
        parsed.filters?.mediaTypes[0],
        userId,
        parsed.filters.contentType
    )


    const normalized =
        normalizeSearchQuery(
            parsed,
            page
        )


    const strategy =
        resolveSearchStrategy(
            normalized
        )


    const cacheOptions =
        setInlineCacheOptions(
            strategy
        )


    /*
     * ==================================================
     * Получаем исходные результаты
     * ==================================================
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
        'API results:',
        result.results?.length
    )

    console.log(
        'total_results:',
        result.total_results
    )

    console.log(
        '================================================'
    )


    /*
     * ==================================================
     * #person ID
     *
     * Особый pipeline:
     *
     * ВСЯ фильмография
     *       ↓
     * normalize
     *       ↓
     * filter
     *       ↓
     * sort
     *       ↓
     * pagination
     * ==================================================
     */

    const personId =
        normalized.filters.id?.[0]


    if (
        strategy === SearchStrategy.PERSON &&
        personId
    ) {

        /*
         * 1. Normalize
         */

        let results =
            (result.results || [])
                .map(
                    normalizeTmdbMedia
                )


        /*
         * 2. Удаляем всё лишнее
         *
         * Здесь используется ТВОЯ
         * общая фильтрация.
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
         * 3. Жанры
         *
         * filterMediaResults уже вызывает
         * normalizeMediaGenres()
         */


        /*
         * 4. Полная сортировка
         */

        results =
            sortMediaResults(
                results
            )


        /*
         * 5. Удаляем дубли
         *
         * combined_credits иногда может
         * вернуть один и тот же проект
         * несколько раз.
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
         * 6. И только теперь пагинация
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


        console.log(
            '[PERSON FILMOGRAPHY]',
            {
                personId,
                beforeFilter:
                result.results?.length,

                afterFilter:
                results.length,

                page,

                totalPages,

                returned:
                paginatedResults.length
            }
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


    /*
     * ==================================================
     * Обычный поиск
     * ==================================================
     */

    result.results =
        (result.results || [])
            .map(
                normalizeTmdbMedia
            )


    filterMediaResults(
        result,
        strategy,
        normalized
    )


    if (
        page === 1 &&
        !parsed.filters.genres[0]
            ?.startsWith('collection')
    ) {

        result.results =
            sortMediaResults(
                result.results
            )
    }


    return {
        ...result,
        inlineOptions:
        cacheOptions
    }
}
