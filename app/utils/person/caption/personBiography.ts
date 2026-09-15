import {formatPersonBiography} from "#server/global/helpers/person/formatPersonBiography";

export interface PersonBiographyData {
    award: any[]
    fact: any[]
}

export const personBiography = (
    biography: string | undefined
): PersonBiographyData => {

    if (!biography) {
        return {
            award: [],
            fact: []
        }
    }

    const awardMarker = '🏆Главные награды🏆'
    const projectsMarker = '🎬Главные проекты🎬'
    const factMarker = '⭐️Интересный факт⭐️'
    const factMarkerAlt = '⭐Интересный факт⭐'

    const awardIndex = biography.indexOf(awardMarker)
    const projectsIndex = biography.indexOf(projectsMarker)

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

    if (markers.length === 0) {
        return {
            award: [],
            fact: []
        }
    }

    let award: any[] = []
    let fact: any[] = []

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

            const colonIndex = section.indexOf(':')

            const list = colonIndex !== -1
                ? section.substring(colonIndex + 1).trim()
                : section

            award = formatPersonBiography(list)
        }

        if (current.name === 'fact') {

            const colonIndex = section.indexOf(':')

            const cleanFact = colonIndex !== -1
                ? section.substring(colonIndex + 1).trim()
                : section

            fact = cleanFact
                ? [
                    {
                        type: 'blockquote',
                        blocks: [
                            {
                                type: 'pullquote',
                                text: cleanFact
                            }
                        ]
                    }
                ]
                : []
        }
    }

    return {
        award,
        fact
    }
}
