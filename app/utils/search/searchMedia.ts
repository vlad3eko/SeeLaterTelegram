import {parseSearchQuery} from "~/utils/search/parseSearchQuery";
import {normalizeSearchQuery} from "~/utils/search/normalizeSearchQuery";
import {resolveSearchStrategy} from "~/utils/search/strategy/resolveSearchStrategy";
import {executeSearchStrategy} from "~/utils/search/strategy/executeSearchStrategy";
import {normalizeTmdbMedia} from "~/utils/media/normalizeTmdbMedia";
import {filterTmdbMediaResults} from "~/utils/media/filterTmdbMediaResults";
import {normalizeMediaGenres} from "#server/bot/consts/media/normalizeMediaGenres";
import {sortMediaResults} from "~/utils/media/sortMediaResults";
import {loadGenres} from "#server/bot/consts/media/genresConvert";

export const searchMedia = async (query: string, page: number = 1, userId: number = null) => {
    await loadGenres()

    const parsed = parseSearchQuery(query, userId)

    const normalized = normalizeSearchQuery(parsed, page)

    const strategy = resolveSearchStrategy(normalized)

    const result = await executeSearchStrategy(strategy, normalized, page)

    const medias = result.results
        .map(normalizeTmdbMedia)
        .filter(media => filterTmdbMediaResults(media, userId))
        .map(normalizeMediaGenres)

    if (page === 1) {
        result.results = sortMediaResults(medias)
    } else {
        console.log('before medias', medias )
        result.results = sortMediaResults(medias, true, userId)
        console.log('after medias', medias )
    }

    return result
}
