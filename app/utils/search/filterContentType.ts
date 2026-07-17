import {ContentType} from "~/utils/search/strategy/enums"

export const filterContentType = (media: any, type?: ContentType) => {

    if (!type) return true

    return media.content_type === type
}
