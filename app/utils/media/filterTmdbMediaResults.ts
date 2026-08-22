export const filterTmdbMediaResults = (
    media: any,
    options?: {
        isBookmarks?: boolean
    }
) => {

    const isBookmarks =
        options?.isBookmarks ?? false

    // Оставляем только фильмы и сериалы
    if (
        media.media_type !== "movie" &&
        media.media_type !== "tv"
    ) {
        return false
    }

    const releaseDateString =
        media.release_date ||
        media.first_air_date

    const releaseDate =
        releaseDateString
            ? Date.parse(releaseDateString)
            : NaN

    const isReleased =
        !Number.isNaN(releaseDate) &&
        releaseDate <= Date.now()

    /*
     * Для вышедших фильмов / сериалов
     * нужны постер и нормальное описание.
     */
    if (isReleased) {

        const hasPoster =
            Boolean(media.poster_path)

        if (!hasPoster) {
            return false
        }

        if (!isBookmarks) {

            const hasOverview =
                typeof media.overview === "string" &&
                media.overview.trim().length >= 20

            if (!hasOverview) {
                return false
            }
        }
    }

    return true
}
