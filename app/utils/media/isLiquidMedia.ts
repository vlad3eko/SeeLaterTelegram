export const isLiquidMedia = (media: any, userId: number): boolean => {

     let today
     let releaseDate
     let isReleased
     let hasTitle
     let hasOverview
     let hasPoster
     let hasVotes
     let hasRating

    if (!userId) {

         today = Date.now()

         releaseDate = new Date(
            media.release_date ||
            media.first_air_date ||
            0
        ).getTime()

         isReleased =
            releaseDate > 0 &&
            releaseDate <= today

        // Будущие фильмы не фильтруем
        if (!isReleased) {
            return true
        }

         hasTitle =
            Boolean(
                (media.title || media.name)?.trim()
            )

         hasOverview =
            (media.overview ?? "")
                .trim()
                .length >= 20

         hasPoster =
            typeof media.poster_path === "string" &&
            media.poster_path.length > 5

         hasVotes =
            (media.vote_count ?? 0) >= 10

         hasRating =
            (media.vote_average ?? 0) >= 5

    }

    return (
        hasTitle &&
        hasOverview &&
        hasPoster &&
        hasVotes &&
        hasRating
    )
}
