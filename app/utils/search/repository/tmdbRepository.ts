import type {NormalizedSearchQuery} from "~/utils/search/typesSearch";
import {buildTmdbParams} from "~/utils/media/buildTmdbParams";

export const searchMulti = async (query: NormalizedSearchQuery, page: number = 1) => {
    return await $fetch(
        "/api/tmdb/search", {
            query: {
                q: query.text,
                page: page,
                media: "multi"
            }
        }
    )
}

export const discoverMovies = async (query: NormalizedSearchQuery, page: number = 1) => {
    return await $fetch(
        "/api/tmdb/discover", {
            query: {
                media: "movie",
                ...buildTmdbParams(query, page)
            }
        }
    )
}

export const getPopularMovies = async (query: NormalizedSearchQuery, page: number = 1) => {
    // пока тоже используем поиск
    // потом заменим на /discover/media?sort_by=popularity.desc
    return await $fetch(
        "/api/tmdb/search", {
            query: {
                q: query.text,
                page: page,
                media: "movie"
            }
        }
    )
}

export const searchMixed = async (query: NormalizedSearchQuery, page: number = 1) => {

    const result: any = await searchMulti(query)

    if (!query.filters.genres.length) {
        return result
    }

    return {
        ...result,

        results: result.results.filter(
            (media: any) => {
                if (!media.genre_ids) return false

                return query.filters.genres.every(
                    genreId =>
                        media.genre_ids.includes(genreId)
                )
            }
        )
    }
}
