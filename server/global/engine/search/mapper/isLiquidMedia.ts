export const isLiquidMedia = (media: any): boolean => {

    const today = Date.now()

    const releaseDate = new Date(
        media.release_date ||
        media.first_air_date ||
        0
    ).getTime()

    const isReleased =
        releaseDate > 0 &&
        releaseDate <= today

    // Будущие фильмы не фильтруем
    if (!isReleased) {
        return true
    }

    const hasTitle =
        Boolean(
            (media.title || media.name)?.trim()
        )

    const hasOverview =
            (media.overview ?? "")
                .trim()
                .length >= 20

    const hasPoster =
        typeof media.poster_path === "string" &&
        media.poster_path.length > 5

    const hasVotes =
        (media.vote_count ?? 0) >= 10

    const hasRating =
        (media.vote_average ?? 0) >= 5

    return (
        hasTitle &&
        hasOverview &&
        hasPoster &&
        hasVotes &&
        hasRating
    )

}
