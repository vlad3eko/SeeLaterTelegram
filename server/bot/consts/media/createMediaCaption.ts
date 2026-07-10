import {FormatDate} from "~/utils/formatMoviesData";
import {mediaReleaseConvert, mediaTypeConvert} from "~/utils/convert/mediaConvert";
import type {TmdbGenre} from "~/types/tmdb.types";
import {genresConvert} from "~/utils/convert/genresConvert";

export const createMediaCaption = (media: any, mediaType: string) => {

    const genresContent = genresConvert(media.genres)

    const mediaTitle = `<code>${media.title || media.name} (${FormatDate(media.release_date || media.first_air_date) || '❌официальной даты пока нет'})</code> `
    const mediaOverview = media.overview?.length > 350
        ? media.overview.slice(0, 150) + '...'
        : media.overview || 'Описание отсутствует'
    const channelLink = `🏷 <a href="https://t.me/kinomanovNet_bot">Киноманов BOT | Ищи и Сохраняй</a>`

    return `${mediaTitle}
                <blockquote expandable>${mediaOverview}</blockquote>\n
<b>Жанр: </b><i>${genresContent || 'нет жанров'}</i>
<b>Тип: </b><i>#${mediaTypeConvert(mediaType)}</i>
<b>Дата выхода: </b><i>${mediaReleaseConvert(media)}</i>\n
<b><i>${channelLink}</i></b>`
}



