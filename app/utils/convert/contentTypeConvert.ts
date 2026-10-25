
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
    mediaType: string,
    contentType: ContentType
): string => {
    if (!mediaType || !contentType) {
        return ''
    }

    return contentTypeToTag[contentType] ?? mediaType
}
