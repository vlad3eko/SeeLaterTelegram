import type {SearchQuery} from "~/utils/search/typesSearch";

export const parseSearchQuery = (
    query: string
): SearchQuery => {

    const words = query
        .trim()
        .split(/\s+/)
        .filter(Boolean)


    const genres: string[] = []

    let page = 1

    const text: string[] = []

    for (const word of words) {

        if (word.startsWith("#")) {
            genres.push(
                word
                    .slice(1)
                    .toLowerCase())
            continue
        }

        if (/^\d+$/.test(word)) {
            const number = Number(word)
            if(number <= 20) page = number
            continue
        }

        text.push(word)

    }

    return {
        text: text.join(" "),
        page,
        filters: {
            genres,
            years: [],
            providers: [],
            countries: [],
            companies: [],
            mediaTypes: [],
            sort: undefined,
            vote: undefined
        }
    }
}
