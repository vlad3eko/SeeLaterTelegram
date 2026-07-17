import type {SearchQuery} from "~/utils/search/typesSearch";
import {ContentType} from "~/utils/search/strategy/enums";

export const parseSearchQuery = (
    query: string,
    userId: number
): SearchQuery => {


    let contentType: ContentType | undefined;

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
            if (["фильм","movie","movies","фильмы"].includes(tag)) {
                mediaTypes.push("movie")
                contentType = ContentType.MOVIE
                continue
            }

            if (["сериал","tv","series","serial","сериалы"].includes(tag)) {
                mediaTypes.push("tv")
                contentType = ContentType.SERIES
                continue
            }

            if (["мультфильм","cartoon","мультфильмы"].includes(tag)) {
                mediaTypes.push("movie")
                contentType = ContentType.CARTOON
                continue
            }

            if (["аниме", "anime"].includes(tag)) {
                mediaTypes.push("tv")
                contentType = ContentType.ANIME
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

            if (["collection"].includes(tag)) {
                bookmarksOfUserId = userId
            }

            genres.push(tag)

            continue
        }

        // ---------- ГОД ----------
        if (/^\d{4}$/.test(cleanWord) &&
            Number(cleanWord) >= 1900 &&
            Number(cleanWord) <= new Date().getFullYear() + 5) {
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
            contentType,
            sort,
            vote,
        }
    }
}
