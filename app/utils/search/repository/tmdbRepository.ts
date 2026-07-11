import type {NormalizedSearchQuery} from "~/utils/search/typesSearch";
import {buildTmdbParams} from "~/utils/media/buildTmdbParams";

export const searchMulti = async (query: NormalizedSearchQuery, page:number = 1)=>{

    let media = "multi"

    if(query.filters.mediaTypes.length === 1){
        media = query.filters.mediaTypes[0]!
    }

    return await $fetch(
        "/api/tmdb/search",
        {
            query:{
                q:query.text,
                page,
                media
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

export const searchMixed = async (query: NormalizedSearchQuery, page:number = 1)=>{

    const result:any = await searchMulti(query,page)

    let results = result.results

    if(query.filters.genres.length){
        results = results.filter(
            (media:any)=>{

                if(!media.genre_ids)
                    return false

                return query.filters.genres.every(
                    genreId =>
                        media.genre_ids.includes(genreId)
                )
            }
        )
    }

    if(query.filters.years.length){

        results = results.filter(
            (media:any)=>{
                const date =
                    media.release_date ||
                    media.first_air_date

                if(!date)
                    return false

                const year =
                    Number(date.slice(0,4))

                return query.filters.years.includes(year)

            }
        )
    }

    return {
        ...result,
        results
    }
}
