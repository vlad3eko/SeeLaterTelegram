import {ContentType} from "~/utils/search/strategy/enums"

const ANIMATION_GENRE = 16

export const normalizeTmdbMedia = (media: any) => {

    const mediaType =
        media.media_type ||
        (
            media.title
                ? 'movie'
                : 'tv'
        )

    const genreIds = media.genre_ids ?? []

    const isAnimation =
        genreIds.includes(ANIMATION_GENRE)

    const isJapanese =
        media.original_language === "ja" ||
        (media.origin_country ?? []).includes("JP")

    let contentType: ContentType

    if (mediaType === "movie") {
        contentType = ContentType.MOVIE
    } else if (!isAnimation) {
        contentType = ContentType.SERIES
    } else if (isJapanese) {
        contentType = ContentType.ANIME
    } else {
        contentType = ContentType.CARTOON
    }

    return {
        ...media,

        id: media.tmdb_id || media.id,

        media_type: mediaType,

        content_type: contentType,

        is_movie: contentType === ContentType.MOVIE,
        is_series: contentType === ContentType.SERIES,
        is_cartoon: contentType === ContentType.CARTOON,
        is_anime: contentType === ContentType.ANIME,

        title:
            media.title ||
            media.name,

        release_date:
            media.release_date ||
            media.first_air_date ||
            null,

        poster_path:
            media.poster_path ||
            media.backdrop_path ||
            null
    }
}
