import {FormatDate} from "~/utils/formatMoviesData";
import {mediaReleaseConvert, mediaTypeConvert} from "~/utils/convert/mediaConvert";
import type {TmdbGenre} from "~/types/tmdb.types";

export const createMediaCaption =  (media: any, isSaved: boolean, mediaType: string) => {
    const releaseDateUndefined = '❌официальной даты пока нет'

    const genresContent = media.genres
        .map((i: TmdbGenre) => i.name)
        .join(' / #')

    const mediaTitle = media.title || media.name
    const mediaOverview = media.overview
    const releaseYear = FormatDate(media.release_date || media.first_air_date) || releaseDateUndefined
    const status = isSaved ? '✅Сохранён' : '❌ Не сохранён'

    return `<code>${mediaTitle} (${releaseYear})</code> 
                <blockquote expandable>${mediaOverview}</blockquote> \n <b>Тип:</b> <i>#${mediaTypeConvert(mediaType)}</i> \n<b>Дата выхода:</b> <i>${mediaReleaseConvert(media)} </i>\n<b>Статус:</b> <i>${status}</i>`
}
//<b>Жанр:</b> <i>#${genresContent}</i>\n
