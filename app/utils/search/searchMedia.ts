import {parseSearchQuery} from "~/utils/search/parseSearchQuery";
import {normalizeSearchQuery} from "~/utils/search/normalizeSearchQuery";
import {resolveSearchStrategy} from "~/utils/search/strategy/resolveSearchStrategy";
import {executeSearchStrategy} from "~/utils/search/strategy/executeSearchStrategy";
import {normalizeTmdbMedia} from "~/utils/media/normalizeTmdbMedia";
import {filterTmdbMediaResults} from "~/utils/media/filterTmdbMediaResults";
import {normalizeMediaGenres} from "#server/bot/consts/media/normalizeMediaGenres";
import {sortMediaResults} from "~/utils/media/sortMediaResults";

export const searchMedia = async (query: string, page: number = 1) => {

    const parsed = parseSearchQuery(query)

    const normalized = normalizeSearchQuery(parsed)

    const strategy = resolveSearchStrategy(normalized)

    const result = await executeSearchStrategy(strategy, normalized, page)
    console.log("SEARCH RESULT", result.results[0])

    const medias = result.results
        .map(normalizeTmdbMedia)
        .filter(filterTmdbMediaResults)
        .map(normalizeMediaGenres)

    console.log(
        "NORMALIZED MEDIA",
        medias[0]
    )

    result.results = sortMediaResults(medias)
    return result
}
