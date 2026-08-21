import {ContentType} from "#server/bot/services/engines/global/engine/search/strategy/enums"

export const filterContentType = (media: any, type?: ContentType) => {

    if (!type) return true

    return media.content_type === type
}

