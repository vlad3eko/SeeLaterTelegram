import {filterTmdbMediaResults} from "~/utils/media/filterTmdbMediaResults";
import {normalizeMediaGenres} from "#server/bot/consts/media/normalizeMediaGenres";
import {SearchStrategy} from "#server/global/engine/search/strategy/enums";
import {filterContentType} from "#server/global/engine/search/mapper/filterContentType";

export const filterMediaResults = (
    result: any,
    strategy: SearchStrategy,
    normalized: any
) => {

    const isPerson =
        strategy === SearchStrategy.PERSON

    result.results = result.results
        .filter((media: any) =>
            filterTmdbMediaResults(
                media,
                {
                    isBookmarks:
                        strategy === SearchStrategy.BOOKMARKS,

                    allowPersons:
                    isPerson
                }
            )
        )
        .map(normalizeMediaGenres)
        .filter((media: any) =>
            filterContentType(
                media,
                normalized.filters.contentType
            )
        )

    return result
}
