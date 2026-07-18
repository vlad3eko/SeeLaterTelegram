import {ContentType} from "~/utils/search/strategy/enums";

export const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
    [ContentType.MOVIE]: "фильм",
    [ContentType.CARTOON]: "мультфильм",
    [ContentType.SERIES]: "сериал",
    [ContentType.CARTOON_SERIES]: "мультсериал",
    [ContentType.ANIME]: "аниме",
}
