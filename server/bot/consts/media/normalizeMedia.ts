import {getGenreNames} from "./genresConvert";

export function normalizeMedia(media: any) {

    if (!media.genres && media.genre_ids) {

        media.genres =
            getGenreNames(
                media.genre_ids,
                media.media_type
            )

    }

    return media

}
