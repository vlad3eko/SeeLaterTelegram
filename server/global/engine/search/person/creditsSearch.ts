import {normalizeTmdbMedia} from "~/utils/media/normalizeTmdbMedia";
import {personSearch} from "#server/global/engine/search/person/personSearch";

export const creditsSearch = (
    result: any,
    page: number,
    cacheOptions: any
) => {

    /*
     * ==================================================
     * 1. SOURCE
     * ==================================================
     *
     * credits.get.ts возвращает полный cast / crew.
     *
     * Здесь НЕ используем personSearch(),
     * потому что personSearch предназначен
     * для обычного поиска людей.
     */

    const entry = personSearch(result, cacheOptions)

    const source = Array.isArray(entry.results)
            ? result.results
            : []

    /*
     * ==================================================
     * 2. NORMALIZE
     * ==================================================
     */

    const results = source.map(normalizeTmdbMedia)

    /*
     * ==================================================
     * 3. PAGINATION
     * ==================================================
     *
     * Telegram не должен получить больше 20
     * inline results за один запрос.
     */

    const PAGE_SIZE = 20

    const totalResults = results.length
    const totalPages = Math.ceil(totalResults / PAGE_SIZE)
    const currentPage = Math.max(1, page)
    const start = (currentPage - 1) * PAGE_SIZE
    const paginatedResults = results.slice(start, start + PAGE_SIZE)

    console.log("[CREDITS SEARCH]", {
            page: currentPage,
            totalResults,
            totalPages,
            returned:
            paginatedResults.length
        }
    )


    /*
     * ==================================================
     * 4. RESPONSE
     * ==================================================
     */

    return {
        ...result,

        results: paginatedResults,
        page: currentPage,
        total_results: totalResults,
        total_pages: totalPages,
        inlineOptions: cacheOptions
    }
}
