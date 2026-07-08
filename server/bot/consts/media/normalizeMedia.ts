import {getGenreNames} from "./genresConvert";

export function normalizeMedia(media: any) {

    if (!media.genres) {

        media.genres = []

        if (media.genre_ids?.length) {
            media.genres = getGenreNames(
                media.genre_ids,
                media.media_type
            ) || []
        }

    }

    return media
}
