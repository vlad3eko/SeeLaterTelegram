export const filterTmdbMediaResults = (
    media: any,
    userId: number,
    options?: {
        isBookmarks?: boolean
    }
) => {

    const isBookmarks =
        options?.isBookmarks ?? false

    if (
        media.media_type !== "movie" &&
        media.media_type !== "tv"
    ) {
        return false
    }

    if (!userId) {
        return false
    }

    const releaseDate = Date.parse(media.release_date)

    const isReleased =
        !Number.isNaN(releaseDate) &&
        releaseDate <= Date.now()

    if (isReleased) {

        const hasPoster =
            Boolean(media.poster_path)

        if (!hasPoster) {
            return false
        }

        if (!isBookmarks) {

            const hasOverview =
                media.overview &&
                media.overview.trim().length >= 20

            if (!hasOverview) {
                return false
            }
        }
    }

    return true
}
