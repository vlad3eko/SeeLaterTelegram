import { isLiquidMedia } from "./isLiquidMedia"
import {filterMediaQuality} from "~/utils/search/filterMediaQuality";

export const sortMediaResults = (
    medias: any[],
    onlyLiquid = false,
    userId: number
) => {

    const today = Date.now()

    const source = medias
        .filter(filterMediaQuality)
        .filter(
            media =>
                !onlyLiquid || isLiquidMedia(media, userId)
        )

    const enriched = source.map(item => {

        const releaseDate = new Date(
            item.release_date ||
            item.first_air_date ||
            0
        ).getTime()

        return {

            ...item,

            _vote:
                item.vote_count || 0,

            _isUnreleased:
                releaseDate > today
        }

    })

    const topRanked =
        [...enriched]
            .sort(
                (a, b) =>
                    b._vote - a._vote
            )
            .slice(0, 3)

    const topIds =
        new Set(
            topRanked.map(
                i => i.id
            )
        )

    const unreleased =
        enriched
            .filter(
                media =>
                    media._isUnreleased &&
                    !topIds.has(media.id)
            )
            .sort(
                (a, b) =>
                    b._vote - a._vote
            )

    const others =
        enriched
            .filter(
                media =>
                    !media._isUnreleased &&
                    !topIds.has(media.id)
            )
            .sort(
                (a, b) =>
                    b._vote - a._vote
            )

    if (onlyLiquid) {
        return others
    }

    return [
        ...unreleased,
        ...topRanked,
        ...others
    ]
}
