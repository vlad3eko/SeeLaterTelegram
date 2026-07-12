import type { SearchQuery } from "~/utils/search/typesSearch";

export const parseSearchQuery = (
    query: string,
    userId: number | null
): SearchQuery => {

    const words = query
        .trim()
        .split(/\s+/)
        .filter(Boolean)

    const genres: string[] = []
    const years: number[] = []
    const providers: string[] = []
    const countries: string[] = []
    const companies: string[] = []
    let bookmarksOfUserId: number | null = null

    const mediaTypes: ("movie" | "tv")[] = []

    let sort: string | undefined
    let vote: number | undefined

    const text: string[] = []

    for (const word of words) {

        const cleanWord = word
            .replace(/[()"«»']/g, '')

        // ---------- TAG ----------
        if (cleanWord.startsWith("#")) {

            const tag = cleanWord
                .slice(1)
                .toLowerCase()

            // тип медиа
            if (["movie", "movies", "фильм", "фильмы"].includes(tag)) {
                mediaTypes.push("movie")
                continue
            }

            if (["tv", "series", "serial", "сериал", "сериалы"].includes(tag)) {
                mediaTypes.push("tv")
                continue
            }

            // сортировка
            if (["popular", "популярные"].includes(tag)) {
                sort = "popularity.desc"
                continue
            }

            if (["rating", "рейтинг"].includes(tag)) {
                sort = "vote_average.desc"
                continue
            }

            if (["new", "новые"].includes(tag)) {
                sort = "primary_release_date.desc"
                continue
            }

            if (["old", "старые"].includes(tag)) {
                sort = "primary_release_date.asc"
                continue
            }

            if (["collection", "collections", "коллекция", "избранные", "избранное", "сохранённые", "сохранённое"].includes(tag)) {
                console.log('parseSearchQuery detect: ', tag)
                bookmarksOfUserId = userId
                console.log('parseSearchQuery bookmarksOfUserId: ', bookmarksOfUserId)
            }

            genres.push(tag)

            continue
        }

        // ---------- ГОД ----------
        if (/^\d{4}$/.test(cleanWord) &&
            Number(cleanWord) >= 1900 &&
            Number(cleanWord) <= new Date().getFullYear() + 5)
        {
            years.push(Number(cleanWord))
            continue
        }

        // ---------- РЕЙТИНГ ----------
        if (/^>\d+(\.\d+)?$/.test(word)) {
            vote = Number(word.slice(1))
            continue
        }

        text.push(word)
    }

    return {
        from: bookmarksOfUserId,
        text: text.join(" "),
        filters: {
            genres,
            years,
            providers,
            countries,
            companies,
            mediaTypes,
            sort,
            vote,
        }
    }
}
