import {personBiography} from "~/utils/person/caption/personBiography";
import {createPersonAwards} from "#server/global/helpers/person/createPersonAwards";

export const entryPersonBiography = (media: any) => {
    const person = personBiography(media.biography)
    return createPersonAwards(media, person)
}
