import {CONTENT_TYPE_LABELS} from "~/utils/convert/library/enumsLibrary";
import {ContentType} from "#server/global/engine/search/strategy/enums";

export const getContentTypeLabel = (
    contentType?: ContentType
) => {
    return CONTENT_TYPE_LABELS[contentType ?? ContentType.MOVIE] ?? 'фильм'
}
