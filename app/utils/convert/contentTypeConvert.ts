import type {ContentType} from "~/utils/engines/search/strategy/enums";

export const contentTypeConvert = (mediaType: any, contentType: ContentType) => {

    if (!mediaType || !contentType) return

    let convert

        if (contentType) {
            if (contentType === 'cartoon') {
                convert = 'мультфильм'
            } else if (contentType === 'movie') {
                convert = 'фильм'
            } else if (contentType === 'series') {
                convert = 'сериал'
            } else if (contentType === 'anime') {
                convert = 'аниме'
            }
        } else if (mediaType) convert = mediaType

    return convert
}
