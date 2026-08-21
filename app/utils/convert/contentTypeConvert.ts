import {ContentType} from "#server/global/engine/search/strategy/enums";

export const contentTypeConvert = (mediaType: any, contentType: ContentType) => {

    if (!mediaType || !contentType) return

    let convert

        switch (contentType) {
            case 'cartoon':
                return convert = 'мультфильм'
            case 'cartoonSeries':
                return convert = 'мультсериал'
            case 'movie':
                return convert = 'фильм'
            case 'series':
                return convert = 'сериал'
            case 'anime':
                return convert = 'аниме'
            case 'person':
                return convert = 'человек'

            default:
                return convert = mediaType
            }
}
