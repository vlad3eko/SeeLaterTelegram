import type {SearchQuery} from "~/utils/search/typesSearch";

export const filterTmdbMediaResults = (
    media: any,
    userId: number,
    query: SearchQuery
) => {

    const ANIMATION_GENRE = 16

    // только фильмы и сериалы
    if (
        media.media_type !== "movie" &&
        media.media_type !== "tv"
    ) {
        return false
    }

    // должно быть описание
    if (!userId) {
        return !(!media.overview ||
            media.overview.trim().length < 20);
    }

    return true
}
