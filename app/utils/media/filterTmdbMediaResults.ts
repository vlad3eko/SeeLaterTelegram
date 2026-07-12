export const filterTmdbMediaResults = (
    media: any
) => {

    // только фильмы и сериалы
    if (
        media.media_type !== "movie" &&
        media.media_type !== "tv"
    ) {
        return false
    }

    // должно быть описание
    if (
        !media.overview ||
        media.overview.trim().length < 20
    ) {
        return false
    }

    return true
}
