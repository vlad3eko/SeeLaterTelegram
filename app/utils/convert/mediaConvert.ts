import {dateConvert} from "~/utils/convert/dateConvert";
import type {TmdbMovieDetails} from "~/types/tmdb.types";
import {runtimeConvert} from "~/utils/convert/runtimeConvert";


export const mediaReleaseConvert = (data: TmdbMovieDetails | undefined) => {
    const typeCheck = data?.media_type === 'movie'

    if (data) {
        if (typeCheck) {
            return dateConvert(data.release_date)
        } else {
            return dateConvert(data.first_air_date)
                + ' - '
                + (data.last_air_date ? dateConvert(data.last_air_date) : 'в процессе')
        }
    }
}

export const mediaTypeConvert = (data: TmdbMovieDetails | undefined) => {
    const typeCheck = data?.media_type === 'movie'

    if (data) {
        if (typeCheck) {
            return 'фильм'
        } else {
            return 'сериал'
        }
    }
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
