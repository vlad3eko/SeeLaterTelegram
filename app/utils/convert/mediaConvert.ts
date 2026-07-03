import {dateConvert} from "~/utils/convert/dateConvert";
import type {TmdbMovieDetails} from "~/types/tmdb.types";
import {runtimeConvert} from "~/utils/convert/runtimeConvert";
import {dateIsoConvert} from "~/utils/convert/dateIsoConvert";


export const mediaReleaseConvert = (media:any, none: string = 'официальной даты пока нет') => {
    const mediaDate = dateConvert(media.release_date) || dateIsoConvert(media.first_air_date);

    if (mediaDate) {
        const [day, month, year] = mediaDate.split('.');
        const mediaTimestamp = new Date(`${year}-${month}-${day}`).getTime();
        const todayTimestamp = new Date().getTime();
        const isFuture = todayTimestamp > mediaTimestamp;

        return isFuture ? `✅ ${mediaDate}` : `❌ ${mediaDate}`;
    } else {
        return none
    }
}

export const mediaTypeConvert = (type: string | undefined) => {
   if (type) return type === 'movie' ? 'фильм' : 'сериал'
}

export const mediaDurationConvert = (data: TmdbMovieDetails | undefined) => {
    const typeCheck = data?.media_type === 'movie'

    if (data) {
        if (typeCheck) {
            return runtimeConvert(data.runtime)
        } else {
            return data.number_of_seasons
                + ' / '
                + data.number_of_episodes
        }
    }
}

export const mediaTitleConvert = (data: TmdbMovieDetails | undefined) => {
    const typeCheck = data?.media_type === 'movie'

    if (data) {
        return typeCheck ? data.title : data.name
    }
}
