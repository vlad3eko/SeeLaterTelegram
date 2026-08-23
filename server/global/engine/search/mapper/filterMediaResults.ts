import {filterTmdbMediaResults} from "~/utils/media/filterTmdbMediaResults";
import {normalizeMediaGenres} from "#server/bot/consts/media/normalizeMediaGenres";
import {SearchStrategy} from "#server/global/engine/search/strategy/enums";
import {filterContentType} from "#server/global/engine/search/mapper/filterContentType";

export const filterMediaResults = (
    result: any,
    strategy: SearchStrategy,
    normalized: any
) => {

    result.results =
        result.results
            .filter((media: any) =>
                filterTmdbMediaResults(
                    media,
                    {
                        isBookmarks:
                            strategy === SearchStrategy.BOOKMARKS
                    }
                )
            )
            .map(normalizeMediaGenres)


    const personId =
        normalized.filters.id?.[0]


    /*
     * #person 2219
     *
     * Здесь results = фильмы/сериалы человека.
     *
     * normalized.filters.contentType === 'person',
     * но применять его к фильмам нельзя.
     */

    if (
        strategy === SearchStrategy.PERSON &&
        personId
    ) {
        return result
    }


    /*
     * Все остальные поисковые сценарии
     * используют обычную фильтрацию contentType.
     */

    result.results =
        result.results.filter(
            (media: any) =>
                filterContentType(
                    media,
                    normalized.filters.contentType
                )
        )


    return result
}
