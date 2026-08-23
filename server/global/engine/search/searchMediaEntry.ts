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
import {normalizeMediaGenres} from "#server/bot/consts/media/normalizeMediaGenres";

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
        parsed.filters.mediaTypes[0],
        userId,
        parsed.filters.contentType
    )

    const normalized =
        normalizeSearchQuery(
            parsed,
            page
        )

    const strategy =
        resolveSearchStrategy(normalized)

    const cacheOptions =
        setInlineCacheOptions(strategy)

    const result =
        await executeSearchStrategy(
            strategy,
            normalized,
            page
        )

    console.log('================ SEARCH DEBUG ================')
    console.log('query:', query)
    console.log('strategy:', strategy)
    console.log('page:', page)
    console.log('normalized:', normalized)
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
    console.log('================================================')


    /*
     * ==========================================
     * NORMALIZE
     * ==========================================
     */

    result.results =
        (result.results || [])
            .map((media: any) =>
                normalizeTmdbMedia(media)
            )


    /*
     * ==========================================
     * PERSON
     * ==========================================
     *
     * Credits уже являются фильмами/сериалами.
     *
     * НЕ применяем:
     * - filterTmdbMediaResults
     * - filterContentType(... PERSON)
     * - sortMediaResults
     *
     * Иначе можно удалить все credits.
     */

    if (strategy === SearchStrategy.PERSON) {

        result.results =
            result.results
                .filter((media: any) => {

                    return (
                        media.media_type === 'movie' ||
                        media.media_type === 'tv'
                    )
                })
                .map(normalizeMediaGenres)


        /*
         * Сортировка работ человека
         *
         * Сначала популярные.
         */

        result.results.sort(
            (a: any, b: any) =>
                (b.popularity || 0) -
                (a.popularity || 0)
        )


        /*
         * ======================================
         * PAGINATION
         * ======================================
         *
         * Telegram максимум 50 результатов.
         *
         * Берём 20 на одну страницу.
         */

        const PAGE_SIZE = 20

        const totalResults =
            result.results.length

        const totalPages =
            Math.ceil(
                totalResults / PAGE_SIZE
            )

        const start =
            (page - 1) * PAGE_SIZE

        const end =
            start + PAGE_SIZE

        result.results =
            result.results.slice(
                start,
                end
            )

        result.page =
            page

        result.total_results =
            totalResults

        result.total_pages =
            totalPages


        console.log(
            '[PERSON PAGINATION]',
            {
                totalResults,
                totalPages,
                page,
                returned:
                result.results.length
            }
        )


        return {
            ...result,
            inlineOptions: cacheOptions
        }
    }


    /*
     * ==========================================
     * ОБЫЧНЫЙ ПОИСК
     * ==========================================
     */

    filterMediaResults(
        result,
        strategy,
        normalized
    )


    if (
        page === 1 &&
        !parsed.filters.genres[0]?.startsWith('collection')
    ) {

        result.results =
            sortMediaResults(
                result.results
            )
    }


    return {
        ...result,
        inlineOptions: cacheOptions
    }
}
