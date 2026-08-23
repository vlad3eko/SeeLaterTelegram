export const filterTmdbMediaResults = (
    media: any,
    options?: {
        isBookmarks?: boolean
    }
) => {

    const isBookmarks =
        options?.isBookmarks ?? false


    /*
     * Только фильмы и сериалы.
     *
     * content_type здесь НЕ проверяем.
     */

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


    if (isReleased) {

        const hasPoster =
            Boolean(
                media.poster_path?.length ||
                media.backdrop_path?.length
            )


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
