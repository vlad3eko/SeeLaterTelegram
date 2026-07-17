import type {ContentType} from "~/utils/search/strategy/enums";

export const contentTypeConvert = (mediaType: any, contentType: any) => {

    if (!mediaType || !contentType) return

    let convert

        if (contentType) {
            if (contentType === 'cartoon') {
                convert = 'мультфильмы'
            } else if (contentType === 'movie') {
                convert = 'фильмы'
            } else if (contentType === 'series') {
                convert = 'сериалы'
            } else if (contentType === 'anime') {
                convert = 'аниме'
            }
        } else if (mediaType) convert = mediaType

    return convert
}
