
export const formatPersonBiography = (text: string): any[] => {

    if (!text) return []

    const awards = text
        .split(/,\s*(?![^[]*\])/)
        .map(item => item.trim())
        .filter(Boolean)

    return awards.map(award => {

        const match = award.match(/\[([^\]]+)\]/)

        const title = match
            ? match[1]
            : ''

        const cleanAward = award
            .replace(/\[[^\]]+\]/, '')
            .trim()

        if (!title) {
            return {
                type: 'paragraph',
                text: cleanAward
            }
        }

        return {
            type: 'paragraph',
            text: [
                {
                    type: 'italic',
                    text: cleanAward
                },
                ' · ',
                {
                    type: 'url',
                    text: title,
                    url: `https://www.google.com/search?q=${encodeURIComponent(
                        title + ' ' + cleanAward
                    )}`
                }
            ]
        }
    })
}
