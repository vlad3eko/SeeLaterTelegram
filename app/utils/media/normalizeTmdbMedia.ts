import {ContentType} from "#server/global/engine/search/strategy/enums";
import {convertTranslateKnowForDepartment} from "#server/global/helpers/person/convert/translateKnowForDepartment";


const ANIMATION_GENRE = 16

export const normalizeTmdbMedia = (media: any, cacheOptions: {}) => {

    const mediaType =
        media.media_type ||
        (
            media.known_for_department
                ? 'person'
                : media.title
                    ? 'movie'
                    : 'tv'
        )

    const genreIds = media.genre_ids ?? []

    const isAnimation =
        genreIds.includes(ANIMATION_GENRE)

    const isJapanese =
        media.original_language === "ja"
        || media.original_language === "zh"
        || (media.origin_country ?? []).includes("JP")
        || (media.origin_country ?? []).includes("ZH")

    const isPerson = !!media.known_for_department

    let contentType: ContentType

    if (mediaType === 'movie') {
        contentType =
            isAnimation
                ? ContentType.CARTOON
                : ContentType.MOVIE
    } else {
        if (isPerson) {
            contentType = ContentType.PERSON
        } else if (!isAnimation) {
            contentType = ContentType.SERIES
        } else if (isJapanese) {
            contentType = ContentType.ANIME
        } else {
            contentType = ContentType.CARTOON_SERIES
        }
    }

    const personType = media.known_for_department ? convertTranslateKnowForDepartment(media.known_for_department) : ''

    return {
        ...media,

        id: media.tmdb_id || media.id,

        media_type: mediaType,

        content_type: personType || contentType,

        is_movie: contentType === ContentType.MOVIE,
        is_series: contentType === ContentType.SERIES,
        is_cartoon: contentType === ContentType.CARTOON,
        is_anime: contentType === ContentType.ANIME,
        is_person: contentType === ContentType.PERSON,

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
            media.profile_path ||
            null,
    }
}
