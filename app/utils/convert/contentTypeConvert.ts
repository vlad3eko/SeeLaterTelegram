import {ContentType} from "#server/global/engine/search/strategy/enums";

export const contentTypeToTag: Record<ContentType, string> = {
    movie: 'фильм',
    cartoon: 'мультфильм',
    series: 'сериал',
    cartoonSeries: 'мультсериал',
    anime: 'аниме',
    person: 'человек',
}

export const contentTypeConvert = (
    mediaType: any,
    contentType: ContentType | undefined
) => {

    if (!mediaType || !contentType)
        return

    switch (contentType) {
        case 'cartoon':
            return 'мультфильм'

        case 'cartoonSeries':
            return 'мультсериал'

        case 'movie':
            return 'фильм'

        case 'series':
            return 'сериал'

        case 'anime':
            return 'аниме'

        case 'person':
            return 'человек'

        default:
            return mediaType
    }
}
