export const sortMediaResults = (
    medias: any[],
    onlyValid: boolean = false
) => {

    const today = Date.now()

    let filtered = medias

    if (onlyValid) {

        filtered = medias.filter(media => {

            const releaseDate = new Date(
                media.release_date ||
                media.first_air_date ||
                0
            ).getTime()

            const isReleased =
                releaseDate > 0 &&
                releaseDate <= today

            const hasTitle =
                !!(media.title || media.name)

            const hasDescription =
                !!media.overview?.trim()

            const hasImage =
                !!(media.poster_path || media.backdrop_path)

            const hasVotes =
                (media.vote_count || 0) >= 10

            // Для будущих релизов достаточно названия
            if (!isReleased) {
                return hasTitle
            }

            // Для уже вышедших фильмов всё обязательно
            return (
                hasTitle &&
                hasDescription &&
                hasImage &&
                hasVotes
            )
        })

    }

    const enriched = filtered.map(item => {

        const date =
            item.release_date ||
            item.first_air_date

        const releaseDate =
            new Date(date || 0).getTime()

        return {
            ...item,

            _vote:
                item.vote_count || 0,

            _date:
            releaseDate,

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
            topRanked.map(i => i.id)
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

    if (onlyValid) {
        return others
    }

    return [
        ...unreleased,
        ...topRanked,
        ...others
    ]
}
