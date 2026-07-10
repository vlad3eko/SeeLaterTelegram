import type {NormalizedSearchQuery} from "~/utils/search/typesSearch";

export const searchMulti = async (query: NormalizedSearchQuery) => {
    return await $fetch(
        "/api/tmdb/search", {
            query: {
                q: query.text,
                page: query.page,
                media: "multi"
            }
        }
    )
}

export const discoverMovies = async (query: NormalizedSearchQuery) => {
    return await $fetch(
        "/api/tmdb/discover", {
            query: {
                media: "movie",
                page: query.page,
                with_genres:
                    query.filters.genres.join(",")
            }
        }
    )
}

export const getPopularMovies = async (query: NormalizedSearchQuery) => {
    // пока тоже используем поиск
    // потом заменим на /discover/media?sort_by=popularity.desc
    return await $fetch(
        "/api/tmdb/search", {
            query: {
                q: query.text,
                page: query.page,
                media: "movie"
            }
        }
    )
}

export const searchMixed = async (query: NormalizedSearchQuery) => {

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
