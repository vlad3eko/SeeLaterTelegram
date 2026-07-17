export const filterTmdbMediaResults = (
    media: any,
    userId: number
) => {

    const ANIMATION_GENRE = 16

    // только фильмы и сериалы
    if (
        media.media_type !== "movie" &&
        media.media_type !== "tv"
    ) {
        return false
    }

    media = media.results.genres.filter((gen) => {
        // if (gen.include(ANIMATION_GENRE)) return false
        console.log('genres media', gen)
    })

    // должно быть описание
    if (!userId) {
        return !(!media.overview ||
            media.overview.trim().length < 20);
    }

    return true
}
