import {FormatDate, FormatRating} from "~/utils/formatMoviesData";
import {mediaReleaseConvert, mediaTypeConvert} from "~/utils/convert/mediaConvert";
import {genresConvert} from "~/utils/convert/genresConvert";
import {CONTENT_TYPE_LABELS} from "~/utils/convert/library/enumsLibrary";
import type {ContentType} from "~/utils/search/strategy/enums";
import {formatMediaOverview} from "~/utils/convert/formatMediaOverview";

export const createMediaCaption = (media: any, contentType: string, comment?: string) => {

    const genresContent = genresConvert(media.genres)
    const mediaOverview =
        formatMediaOverview(media.overview)

    const mediaTitle = `<code>${media.title || media.name} (${FormatDate(media.release_date || media.first_air_date) || '-'})</code>`
    comment = `${comment ? `\n<i>${comment}</i>\n` : ''}`
    const population = `${media.vote_average ? '💎' + FormatRating(media?.vote_average): ''}`
    const botLink = `🤖 <a href="https://t.me/kinomanovNet_bot">Киноманов BOT | Ищи и Сохраняй</a>`
    const channelLink = `📢 <a href="https://t.me/kinomanovnet">Киноманов NET | Фильмы и сериалы</a>`

    return `${mediaTitle} ${population}\n${comment}
<blockquote expandable>${mediaOverview}</blockquote>\n
<b>Жанр: </b><i>${genresContent || 'нет жанров'}</i>
<b>Тип: </b><i>#${CONTENT_TYPE_LABELS[contentType as ContentType]}</i>
<b>Дата выхода: </b><i>${mediaReleaseConvert(media)}</i>\n
<b><i>${botLink}</i></b>
<b><i>${channelLink}</i></b>`
}



