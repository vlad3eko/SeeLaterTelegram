import {buildTmdbParams} from "~/utils/media/buildTmdbParams";
import {tmdbFetch} from "#server/utils/api/tmdbFetch";
import type {NormalizedSearchQuery} from "#server/global/engine/search/mapper/typesSearch";


export const searchMulti = async (
    query: NormalizedSearchQuery,
    page: number
) => {

    const media =
        query.filters.mediaTypes[0] ?? "multi"

    return await tmdbFetch(
        "/api/tmdb/search",
        {
            query: {
                q: query.text,
                page,
                media,
            }
        }
    )
}


export const discoverMovies = async (
    query: NormalizedSearchQuery,
    page: number
) => {

    const media =
        query.filters.mediaTypes[0] ?? "movie"

    return await tmdbFetch(
        "/api/tmdb/discover",
        {
            query: {
                media,
                ...buildTmdbParams(query, page)
            }
        }
    )
}


export const getPopularMovies = async (
    query: NormalizedSearchQuery,
    page: number
) => {

    const media =
        query.filters.mediaTypes[0] ?? "movie"

    return await tmdbFetch(
        "/api/tmdb/popular",
        {
            query: {
                media,
                page
            }
        }
    )
}


export const getPersonApi = async (
    personID: any
) => {

    return await tmdbFetch(
        "/api/tmdb/person",
        {
            query: {
                id: personID
            }
        }
    )
}


/*
 * ==================================================
 * SEARCH MIXED
 * ==================================================
 */

export const searchMixed = async (
    query: NormalizedSearchQuery,
    page: number
) => {

    const result: any =
        await searchMulti(query, page)

    let results =
        result.results

    if (query.filters.genres.length) {

        results =
            results.filter(
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

        results =
            results.filter(
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


/*
 * ==================================================
 * PERSON
 *
 * Старый механизм НЕ МЕНЯЕМ.
 *
 * #person
 * #person 2219
 * #person 2219 #cast
 * ==================================================
 */

export const searchPerson = async (
    query: NormalizedSearchQuery
) => {

    const personId =
        query.filters.id?.[0]

    const personJob =
        query.filters.personJob?.[0] || "cast"


    if (personId) {

        return await tmdbFetch(
            "/api/tmdb/credits",
            {
                query: {
                    id: personId,
                    personJob,
                    mediaType: "person"
                }
            }
        )
    }


    return await searchMulti(
        query,
        query.page
    )
}


/*
 * ==================================================
 * CREDITS
 *
 * 634649 #cast
 * 634649 #crew
 *
 * ID здесь относится к movie/tv.
 *
 * mediaType НЕ передаём.
 *
 * credits.get.ts сам определит:
 * movie или tv.
 * ==================================================
 */

export const searchCredits = async (
    query: NormalizedSearchQuery
) => {

    const mediaTypes =
        query.filters?.mediaTypes?.[0]

    const mediaId =
        query.filters.id?.[0]

    const personJob =
        query.filters.creditType || "cast"


    if (!mediaId) {

        return {
            results: [],
            total_results: 0,
            total_pages: 1,
            page: 1
        }
    }


    return await tmdbFetch(
        "/api/tmdb/credits",
        {
            query: {
                id: mediaId,
                personJob,
                mediaTypes
            }
        }
    )
}


/*
 * ==================================================
 * BOOKMARKS
 * ==================================================
 */

export const getBookmarks = async (
    query: NormalizedSearchQuery,
    page: number
) => {

    return await $fetch(
        "/api/:media",
        {
            query: {
                userId: query.from,
                page,
                genres: query.filters.genres,
                years: query.filters.years,
                mediaTypes: query.filters.mediaTypes,
                contentType: query.filters.contentType,
                sort: query.filters.sort,
                vote: query.filters.vote
            }
        }
    )
}


/*
 * ==================================================
 * SEARCH HISTORY
 * ==================================================
 */

export const saveLastSearchQuery = async (
    query: string[],
    mediaType: string | undefined,
    userId: number,
    contentType: string | undefined
) => {

    await $fetch(
        "/api/bot/search/saveSearchQuery",
        {
            method: "POST",
            query: {
                q: query,
                media_type: mediaType,
                content_type: contentType,
                user_id: userId
            }
        }
    )
}


export const getLastSearchQuery = async (
    userId: number
) => {

    return await $fetch(
        "/api/bot/search/getSearchQuery",
        {
            method: "GET",
            query: {
                user_id: userId
            }
        }
    )
}
