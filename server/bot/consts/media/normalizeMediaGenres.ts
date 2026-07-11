import {getGenreNames} from "./genresConvert";


export function normalizeMediaGenres(media:any){

    if (!media.genre_ids?.length){
        return {
            ...media,
            genres:[]
        }
    }

    return {
        ...media,
        genres:
            getGenreNames(
                media.genre_ids,
                media.media_type
            )
    }
}
