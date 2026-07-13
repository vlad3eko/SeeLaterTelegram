import {parseSearchQuery} from "~/utils/search/parseSearchQuery";
import {normalizeSearchQuery} from "~/utils/search/normalizeSearchQuery";
import {resolveSearchStrategy} from "~/utils/search/strategy/resolveSearchStrategy";
import {executeSearchStrategy} from "~/utils/search/strategy/executeSearchStrategy";
import {normalizeTmdbMedia} from "~/utils/media/normalizeTmdbMedia";
import {filterTmdbMediaResults} from "~/utils/media/filterTmdbMediaResults";
import {normalizeMediaGenres} from "#server/bot/consts/media/normalizeMediaGenres";
import {sortMediaResults} from "~/utils/media/sortMediaResults";
import {loadGenres} from "#server/bot/consts/media/genresConvert";

export const searchMedia = async (query: string, page: number = 1, userId: number | null = null) => {
    await loadGenres()

    console.log('2 searchMedia', query, page, userId)

    const parsed = parseSearchQuery(query, userId)

    const normalized = normalizeSearchQuery(parsed, page)

    const strategy = resolveSearchStrategy(normalized)

    const result = await executeSearchStrategy(strategy, normalized, page)

    console.log('7 before result[0]', result.results[0])
    const medias = result.results
        .map(normalizeTmdbMedia)
        .filter((media: any) => filterTmdbMediaResults(media, userId))
        .map(normalizeMediaGenres)
    console.log('8 after result[0]', medias[0])

    if (page === 1) {
        result.results = sortMediaResults(medias)
    } else if (!userId) {
        result.results = sortMediaResults(medias, true)
    }
    console.log('9 medias', medias)

    return medias
}
