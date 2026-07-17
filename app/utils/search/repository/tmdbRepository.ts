import type {NormalizedSearchQuery} from "~/utils/search/typesSearch";
import {buildTmdbParams} from "~/utils/media/buildTmdbParams";

export const searchMulti = async (query: NormalizedSearchQuery, page: number) => {

    const media = query.filters.mediaTypes[0] ?? "multi"

    return await $fetch(
        "/api/tmdb/search",
        {
            query: {
                q: query.text,
                page,
                media
            }
        }
    )
}

export const discoverMovies = async (query: NormalizedSearchQuery, page: number) => {

    console.log('media outside', query.filters.mediaTypes)
    const media = query.filters.mediaTypes[0] ?? 'movie'

    return await $fetch(
        "/api/tmdb/discover",
        {
            query: {
                media,
                ...buildTmdbParams(query, page)
            }
        }
    )
}

export const getPopularMovies = async (query: NormalizedSearchQuery, page: number) => {

    const media = query.filters.mediaTypes[0] ?? 'movie'

    return await $fetch("/api/tmdb/popular", {
        query: {
            media,
            page
        }
    })
}

export const searchMixed = async (query: NormalizedSearchQuery, page: number) => {

    const result: any = await searchMulti(query, page)

    let results = result.results

    if (query.filters.genres.length) {
        results = results.filter(
            (media: any) => {

                if (!media.genre_ids)
                    return false

                return query.filters.genres.every(
                    genreId =>
                        media.genre_ids.includes(genreId)
                )
            }
        )
    }

    if (query.filters.years.length) {

        results = results.filter(
            (media: any) => {
                const date =
                    media.release_date ||
                    media.first_air_date

                if (!date)
                    return false

                const year =
                    Number(date.slice(0, 4))

                return query.filters.years.includes(year)

            }
        )
    }

    return {
        ...result,
        results
    }
}

export const getBookmarks = async (query: NormalizedSearchQuery, page: number) => {
    return await $fetch('/api/:media', {
        query: {
            userId: query.from,
            page
        }
    })
}

export const saveLastSearchQuery = async (query: NormalizedSearchQuery, mediaType: string | undefined, userId: number) => {
    await $fetch('/api/bot/search/saveSearchQuery', {
        method: 'POST',
        query: {
            q: query,
            media_type: mediaType,
            content_type: query.filters.contentType,
            user_id: userId
        }
    })
}

export const getLastSearchQuery = async (userId: number) => {
    return await $fetch('/api/bot/search/getSearchQuery', {
        method: 'GET',
        query: {
            user_id: userId
        }
    })
}
