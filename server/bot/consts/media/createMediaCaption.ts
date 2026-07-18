import {FormatDate, FormatRating} from "~/utils/formatMoviesData";
import {mediaReleaseConvert, mediaTypeConvert} from "~/utils/convert/mediaConvert";
import {genresConvert} from "~/utils/convert/genresConvert";
import {CONTENT_TYPE_LABELS} from "~/utils/convert/library/enumsLibrary";
import type {ContentType} from "~/utils/search/strategy/enums";

export const createMediaCaption = (media: any, contentType: string) => {

    const genresContent = genresConvert(media.genres)

    const mediaTitle = `<code>${media.title || media.name} (${FormatDate(media.release_date || media.first_air_date) || '-'})</code>`
    const population = `${media.vote_average ? '💎' + FormatRating(media?.vote_average) + ' • ' : ''}${media.vote_count ? '🍿' + media.vote_count : ''}`
    const mediaOverview = media.overview?.length > 350
        ? media.overview.slice(0, 350) + '...'
        : media.overview || 'Описание отсутствует'
    const channelLink = `🏷 <a href="https://t.me/kinomanovNet_bot">Киноманов BOT | Ищи и Сохраняй</a>`

    return `${mediaTitle}\n
${population}
<blockquote expandable>${mediaOverview}</blockquote>\n
<b>Жанр: </b><i>${genresContent || 'нет жанров'}</i>
<b>Тип: </b><i>#${CONTENT_TYPE_LABELS[contentType as ContentType]}</i>
<b>Дата выхода: </b><i>${mediaReleaseConvert(media)}</i>\n
<b><i>${channelLink}</i></b>`
}



