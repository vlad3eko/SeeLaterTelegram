import type {SearchQuery} from "~/utils/search/typesSearch";

export const filterTmdbMediaResults = (
    media: any,
    userId: number,
) => {

    const releaseDate = Date.parse(media.release_date)
    const dateNow = Date.now()

    if (
        media.media_type !== "movie" &&
        media.media_type !== "tv"
    ) {
        return false
    }

    if (!userId) return false

//[DEV-search]
    if (releaseDate < dateNow) {
        if (!media.poster_path.length) {
            return false
        } else if (!media.overview ||
            media.overview.trim().length < 20) {
            return false
        }
    }

    return true
}

