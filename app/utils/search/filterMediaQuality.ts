export const filterMediaQuality = (
    media: any
) => {

    // нет картинки
    if (
        !media.poster_path &&
        !media.backdrop_path
    ) {
        return false
    }

    // нет даты
    if (
        !media.release_date &&
        !media.first_air_date
    ) {
        return false
    }

    return true
}
