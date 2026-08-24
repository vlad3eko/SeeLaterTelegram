import {convertTranslateKnowForDepartment} from "#server/global/helpers/person/convert/translateKnowForDepartment";

export const convertProfession = (media: any) => {

    const professions = [
        media.known_for_department
            ? `🎭 ${convertTranslateKnowForDepartment(media.known_for_department)}`
            : '',

        ...(media.combined_credits?.crew ?? [])
            .map((movie: any) => {
                if (!movie.job) return null

                const profession =
                    convertTranslateKnowForDepartment(movie.job)

                if (!profession) return null

                return `🎬 ${profession}`
            })
            .filter(Boolean)
    ]

    return [...new Set(professions)].join('\n')
}
