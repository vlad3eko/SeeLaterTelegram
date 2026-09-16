import {genresConvert} from "~/utils/convert/genresConvert";
import {FormatDate, FormatRating} from "#server/global/engine/search/mapper/formatMoviesData";
import {CONTENT_TYPE_LABELS} from "~/utils/convert/library/enumsLibrary";
import {ContentType} from "#server/global/engine/search/strategy/enums";

export const dataCollectionMediaCard = (
    data: {
        media: any,
        contentType: string,
        addComment?: string,
        addOverview?: string,
        keyTrailer?: string,
        images?: {
            poster: (string | null)[];
            postersList: ({
                id: number;
                fileId: string;
                name: string;
                role: string;
            } | null)[];
        },
    }
) => {

    const media = data.media
    const images = data.images

    const heading = (text: string, size: number) => ({
        type: 'heading',
        size,
        text
    })

    const spaceRow = {
        type: 'paragraph',
        text: ''
    }

    const title = String(media.title
        || media.name
        || 'Без названия')

    const originalTitle = String(media.original_title
        || media.original_name
        || '')

    const rating = media.vote_average
        ? String(FormatRating(media.vote_average))
        : '—'

    const genres = media.genres?.length
        ? String(genresConvert(media.genres)
            || 'нет жанров')
        : 'нет жанров'

    const releaseDate = media.release_date
        || media.first_air_date

    const date = releaseDate
        ? String(FormatDate(releaseDate)
            || '-')
        : '-'

    const overview = String(data.addOverview
        || media.overview
        || 'Описание отсутствует')

    const mediaType = String(CONTENT_TYPE_LABELS[(data.contentType || media.media_type) as ContentType]
        || data.contentType
        || 'фильм')

    const slideshowImages = (images?.postersList || [])
        .map(person => person?.fileId)
        .filter(Boolean)

    const hasTrailer = Boolean(data.keyTrailer && !data.keyTrailer.includes('undefined'))

    return {
        data,
        heading,
        spaceRow,
        title,
        originalTitle,
        rating,
        genres,
        date,
        overview,
        mediaType,
        slideshowImages,
        hasTrailer,
    }
}
