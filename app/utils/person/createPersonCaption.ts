import {entryPersonBiography} from "#server/global/helpers/person/entryPersonBiography";

export const createPersonCaption = (media: any) => {
    return entryPersonBiography(media)
}
