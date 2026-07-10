import {getGenreNames} from "./genresConvert";


export function normalizeMediaGenres(media:any){

    if(media.genres){
        return media.genres
    }

    if(!media.genre_ids?.length){
        return []
    }

    return getGenreNames(media.genre_ids, media.media_type)
}
