import {normalizeMediaGenres} from "#server/bot/consts/media/normalizeMediaGenres";
import {loadGenres} from "#server/bot/consts/media/genresConvert";

export const mapTmdbMedia = async (
    media:any
)=>{
    await loadGenres()

    const normalized =
        normalizeMediaGenres(media)

    return {
        id: normalized.id,
        title:
            normalized.title ||
            normalized.name,
        genres:
        normalized.genres,
    }
}
