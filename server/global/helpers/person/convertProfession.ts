import {convertTranslateKnowForDepartment} from "#server/global/helpers/person/convert/translateKnowForDepartment";

export const convertProfession = (media: any) => {
    const professionFirst =
        '🎭 ' + convertTranslateKnowForDepartment(media.known_for_department)
    const professionSecond = () => {
        const x = convertTranslateKnowForDepartment(media.combined_credits?.crew[0]?.job)
        if (!x) return ''

        return ' • 🎬 ' + x
    }


    return `${professionFirst}${professionSecond()}`
}
