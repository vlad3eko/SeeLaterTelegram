import {createPersonCardBasic} from "#server/global/helpers/person/entryPersonBiography";

export const createPersonCaption = (media: any) => {
    return createPersonCardBasic(media)
}
