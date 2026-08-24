import {formatMediaOverview} from "~/utils/convert/formatMediaOverview"
import {formatPersonBiography} from "#server/global/helpers/person/formatPersonBiography";

export interface PersonBiographyData {
    biography: string
    awards: string | undefined
    fact: string | undefined
}

export const personBiography = (
    biography: string | undefined
): PersonBiographyData => {

    if (!biography) {
        return {
            biography: '',
            awards: '',
            fact: '',
        }
    }

    const awardMarker = '🏆Главные награды🏆'
    const projectsMarker = '🎬Главные проекты🎬'
    const factMarker = '⭐️Интересный факт⭐️'
    const factMarkerAlt = '⭐Интересный факт⭐'

    let awardIndex = biography.indexOf(awardMarker)

    let projectsIndex = biography.indexOf(projectsMarker)

    let factIndex = biography.indexOf(factMarker)

    if (factIndex === -1) {
        factIndex = biography.indexOf(factMarkerAlt)
    }

    const markers = [
        {
            name: 'award',
            index: awardIndex
        },
        {
            name: 'projects',
            index: projectsIndex
        },
        {
            name: 'fact',
            index: factIndex
        }
    ]
        .filter(item => item.index !== -1)
        .sort((a, b) => a.index - b.index)

    /*
     * Если специальных блоков нет,
     * всё считаем обычной биографией.
     */
    if (markers.length === 0) {

        return {
            biography: formatMediaOverview(biography),
            awards: '',
            fact: ''
        }
    }

    /*
     * Основная биография
     */
    const firstMarkerIndex = markers[0]?.index ?? biography.length

    const bioText = biography
        .substring(0, firstMarkerIndex)
        .trim()

    let awards = ''
    let fact = ''

    /*
     * Разбираем специальные секции
     */
    for (let i = 0; i < markers.length; i++) {

        const current = markers[i]

        if (!current) continue

        const next = markers[i + 1]

        const start = current.index

        const end = next
            ? next.index
            : biography.length

        const section = biography
            .substring(start, end)
            .trim()

        if (current.name === 'award') {
            awards = section
        }

        if (current.name === 'fact') {
            fact = section
        }
    }

    /*
     * Обрабатываем награды
     */
    if (awards) {

        const colonIndex = awards.indexOf(':')

        if (colonIndex !== -1) {

            let list = awards
                .substring(colonIndex + 1)
                .trim()

            const items = list.split(
                /,\s*(?![^[]*\])/
            )

            awards = items
                .map(item => formatPersonBiography(item.trim()))
                .filter(Boolean)
                .join('\n')


        } else {

            awards = formatPersonBiography(awards)
        }
    }

    /*
     * Обрабатываем факт
     */
    if (fact) {

        const colonIndex = fact.indexOf(':')

        if (colonIndex !== -1) {
            fact = fact
                .substring(colonIndex + 1)
                .trim()
        }

        fact = formatPersonBiography(fact)
    }

    return {
        biography: formatMediaOverview(bioText, 300),
        awards,
        fact
    }
}
