
import {ContentType} from "#server/global/engine/search/strategy/enums";
import {convertTranslateKnowForDepartment} from "#server/global/helpers/person/convert/translateKnowForDepartment";
import {classifyOrigin} from "#server/global/engine/collections/shelves";

const ANIMATION_GENRE = 16

export const normalizeTmdbMedia = (media: any) => {

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

    // Один классификатор с подборками /g (shelves.ts): аниме — японская анимация; китайская
    // (дунхуа) и совместная — мультфильмы и мультсериалы (решение владельца 19.11).
    const isJapanese =
        isAnimation &&
        classifyOrigin(media, media.title ? 'movie' : 'tv') === 'japan'

    const isPerson =
        mediaType === 'person' ||
        !!media.known_for_department

    let contentType: ContentType

    if (isPerson) {

        contentType = ContentType.PERSON

    } else if (mediaType === 'movie') {

        contentType =
            !isAnimation
                ? ContentType.MOVIE
                : isJapanese
                    ? ContentType.ANIME
                    : ContentType.CARTOON

    } else {

        if (!isAnimation) {

            contentType = ContentType.SERIES

        } else if (isJapanese) {

            contentType = ContentType.ANIME

        } else {

            contentType = ContentType.CARTOON_SERIES
        }
    }

    return {
        ...media,

        id:
            media.tmdb_id ||
            media.id,

        media_type: mediaType,

        // ВАЖНО:
        // здесь всегда именно ContentType
        content_type: contentType,

        // Отдельно сохраняем профессию человека
        person_department:
            isPerson && media.known_for_department
                ? convertTranslateKnowForDepartment(
                    media.known_for_department
                )
                : '',

        is_movie:
            contentType === ContentType.MOVIE,

        is_series:
            contentType === ContentType.SERIES,

        is_cartoon:
            contentType === ContentType.CARTOON,

        is_anime:
            contentType === ContentType.ANIME,

        is_person:
            contentType === ContentType.PERSON,

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
