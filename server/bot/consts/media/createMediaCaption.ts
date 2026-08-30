import {FormatDate, FormatRating} from "~/utils/formatMoviesData";
import {mediaReleaseConvert, mediaTypeConvert} from "~/utils/convert/mediaConvert";
import {genresConvert} from "~/utils/convert/genresConvert";
import {CONTENT_TYPE_LABELS} from "~/utils/convert/library/enumsLibrary";
import {formatMediaOverview} from "~/utils/convert/formatMediaOverview";
import {ContentType} from "#server/global/engine/search/strategy/enums";
import {SHARE_CHANNEL_LINKS} from "#server/global/notifications/sendNotificationMessage";

export const createMediaCaption = (media: any, contentType: string, addComment: string | undefined, addOverview: string | undefined, keyTrailer?: string | undefined) => {

    const genresContent = genresConvert(media.genres)
    const mediaOverview =
        formatMediaOverview(media.overview, 350, addOverview)
    const formatDate =
        `(${FormatDate(media.release_date || media.first_air_date) || '-'})`

    const checkKeyTrailer = keyTrailer?.length && typeof keyTrailer !== 'undefined' && !keyTrailer.includes('undefined')

    const trailerMessage = `${checkKeyTrailer
        ? `✅ <a href="https://www.youtube.com/watch?v=${keyTrailer}">смотреть</a>`
        : '❌ Трейлера пока нет'}`

    const mediaTitle = `<code>${media.title || media.name} ${formatDate}</code>`
    const mediaOriginalTitle = `<i>${media.original_title ? `\n • original: <code>${media.original_title} ${formatDate}</code>` : ''}</i>`
    addComment = `${addComment ? `\n<i>${addComment}</i>\n` : ''}`
    const grade = `${media.vote_average ? FormatRating(media?.vote_average) + '💎' : ''}`

    return `${addComment}
${grade} ${mediaTitle} ${mediaOriginalTitle}\n
<blockquote expandable>${mediaOverview}</blockquote>\n
<b>Жанр: </b><i>${genresContent || 'нет жанров'}</i>
<b>Тип: </b><i>#${CONTENT_TYPE_LABELS[contentType as ContentType]}</i>
<b>Дата выхода: </b><i>${mediaReleaseConvert(media)}</i>
<b>🔥 Трейлер: </b><i>${trailerMessage}</i>
<b><i>${SHARE_CHANNEL_LINKS.Group}</i></b>`
}


