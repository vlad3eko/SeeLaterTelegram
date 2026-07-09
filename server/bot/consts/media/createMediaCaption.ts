import {FormatDate} from "~/utils/formatMoviesData";
import {mediaReleaseConvert, mediaTypeConvert} from "~/utils/convert/mediaConvert";
import type {TmdbGenre} from "~/types/tmdb.types";

export const createMediaCaption = (media: any, isSaved: boolean, mediaType: string) => {

    const releaseDateUndefined = '❌официальной даты пока нет'

    const genresContent = (media.genres || [])
        .map((i: TmdbGenre) => i.name)
        .join(' / #') || 'нет данных'

    const mediaTitle = media.title || media.name
    const mediaOverview = media.overview?.length > 350
        ? media.overview.slice(0, 150) + '...'
        : media.overview || 'Описание отсутствует'
    const releaseYear = FormatDate(media.release_date || media.first_air_date) || releaseDateUndefined

    return `<code>«${mediaTitle}» (${releaseYear})</code> 
                <blockquote expandable>${mediaOverview}</blockquote> \n<b>Жанр:</b> <i>#${genresContent}</i>\n<b>Тип:</b> <i>#${mediaTypeConvert(mediaType)}</i> \n<b>Дата выхода:</b> <i>${mediaReleaseConvert(media)} </i>\n`
}
