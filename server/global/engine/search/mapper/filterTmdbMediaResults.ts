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
     */

    if (
        media.media_type !== "movie" &&
        media.media_type !== "tv"
    ) {
        return false
    }


    /*
     * Определяем дату релиза.
     */

    const releaseDateString =
        media.release_date ||
        media.first_air_date


    const releaseDate =
        releaseDateString
            ? Date.parse(releaseDateString)
            : NaN


    /*
     * Если TMDB вообще не дал дату —
     * такой результат не используем.
     *
     * Важно:
     * неизвестная дата != будущий релиз.
     */

    if (Number.isNaN(releaseDate)) {
        return false
    }


    /*
     * Будущий релиз.
     *
     * Для него пока допускаем отсутствие
     * постера и описания.
     */

    const isUnreleased =
        releaseDate > Date.now()


    if (isUnreleased) {
        return true
    }


    /*
     * Уже вышедший фильм / сериал.
     *
     * Для bookmarks сохраняем старое поведение:
     * если это закладка, дополнительные требования
     * к overview не применяем.
     */

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


    return true
}
