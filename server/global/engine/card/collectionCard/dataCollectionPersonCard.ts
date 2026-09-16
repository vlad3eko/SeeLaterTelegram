import {personBiography} from "#server/global/engine/card/collectionCard/personBiography";
import {CardData} from "#server/global/engine/card/enum/types";

export const dataCollectionPersonCard = (
    data: CardData
) => {

    const media = data.media
    const person = personBiography(media.biography)
    const title = String(media.name || 'Без имени')

    return {
        data,
        media,
        title,
        profession: media.known_for_department || '',
        award: person.award,
        fact: person.fact
    }
}
